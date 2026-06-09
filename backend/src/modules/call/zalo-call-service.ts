import axios from 'axios';
import net from 'net';
import { getTenantPrisma } from '../../shared/database/prisma-tenant.js';
import { logger } from '../../shared/utils/logger.js';
import { zaloOAService } from '../zalo-oa/zalo-oa-service.js';
import { prisma } from '../../shared/database/prisma-client.js';


const ZALO_CALL_BASE = 'https://openapi.zalo.me/v2.0/oa/call';

// Normalize phone to Zalo format: 84xxxxxxxxx
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('84')) return digits;
  if (digits.startsWith('0')) return '84' + digits.slice(1);
  return digits;
}

function originateCallViaAMI(agentChannel: string, exten: string, appId: string, oaId: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const client = net.createConnection({ host: 'asterisk', port: 5038 }, () => {
      logger.info('[AMI] Connected to Asterisk AMI');
    });

    let buffer = '';
    let loginSent = false;
    let originateSent = false;
    let closed = false;

    const cleanupAndResolve = (val: boolean) => {
      if (closed) return;
      closed = true;
      try {
        client.write('Action: Logoff\r\n\r\n');
        client.end();
      } catch (e) {}
      resolve(val);
    };

    const cleanupAndReject = (err: Error) => {
      if (closed) return;
      closed = true;
      try {
        client.end();
      } catch (e) {}
      reject(err);
    };

    client.on('data', (data) => {
      buffer += data.toString();
      
      // Step 1: Login on banner
      if (buffer.includes('Asterisk Call Manager') && !loginSent) {
        loginSent = true;
        client.write(
          'Action: Login\r\n' +
          'Username: crmadmin\r\n' +
          'Secret: crmadminpassword123\r\n\r\n'
        );
        buffer = '';
        return;
      }

      // Step 2: Handle login response, send Originate
      if (loginSent && !originateSent && buffer.includes('Response: Success') && buffer.includes('Message: Authentication accepted')) {
        originateSent = true;
        client.write(
          'Action: Originate\r\n' +
          `Channel: ${agentChannel}\r\n` +
          'Context: zcc-outbound\r\n' +
          `Exten: ${exten}\r\n` +
          'Priority: 1\r\n' +
          `Variable: APP_ID=${appId}\r\n` +
          `Variable: OA_ID=${oaId}\r\n` +
          'Async: true\r\n\r\n'
        );
        buffer = '';
        return;
      }


      // Step 3: Handle Originate response
      if (originateSent) {
        if (buffer.includes('Response: Success')) {
          logger.info('[AMI] Originate request sent successfully');
          cleanupAndResolve(true);
        } else if (buffer.includes('Response: Error')) {
          logger.error(`[AMI] Originate error: ${buffer}`);
          cleanupAndReject(new Error('Asterisk Originate failed'));
        }
      }
    });

    client.on('error', (err) => {
      if (!closed) {
        logger.error(`[AMI] Connection error: ${err.message}`);
        cleanupAndReject(err);
      }
    });
  });
}

let amiListenerConnected = false;
function startAMIListener() {
  if (amiListenerConnected) return;
  amiListenerConnected = true;

  let client: net.Socket | null = null;
  let buffer = '';
  let loginSent = false;
  let reconnectTimer: NodeJS.Timeout | null = null;

  const connect = () => {
    loginSent = false;
    buffer = '';
    client = net.createConnection({ host: 'asterisk', port: 5038 }, () => {
      logger.info('[AMI-Listener] Connected to Asterisk AMI for real-time status updates');
    });

    client.on('data', async (data) => {
      buffer += data.toString();
      
      // Handle Login
      if (buffer.includes('Asterisk Call Manager') && !loginSent) {
        loginSent = true;
        client?.write(
          'Action: Login\r\n' +
          'Username: crmadmin\r\n' +
          'Secret: crmadminpassword123\r\n\r\n'
        );
        buffer = '';
        return;
      }

      // Process Event Blocks
      let index;
      while ((index = buffer.indexOf('\r\n\r\n')) !== -1) {
        const block = buffer.substring(0, index);
        buffer = buffer.substring(index + 4);
        
        try {
          const lines = block.split('\r\n');
          const headers: Record<string, string> = {};
          for (const line of lines) {
            const p = line.indexOf(': ');
            if (p !== -1) {
              const key = line.substring(0, p).trim();
              const val = line.substring(p + 2).trim();
              headers[key] = val;
            }
          }

          const eventName = headers['Event'];
          if (!eventName) continue;

          const channel = headers['Channel'] || '';
          if (channel.startsWith('PJSIP/101') || channel.startsWith('PJSIP/102')) {
            const agentId = '101'; // Default agent

            if (eventName === 'Newstate') {
              const state = headers['ChannelStateDesc'];
              logger.info(`[AMI-Listener] Channel state: ${channel} -> ${state}`);
              
              if (state === 'Up') {
                const callLog = await prisma.zaloCallLog.findFirst({
                  where: {
                    callStatus: { in: ['initiated', 'ringing'] }
                  },
                  orderBy: { createdAt: 'desc' }
                });
                if (callLog) {
                  await prisma.zaloCallLog.update({
                    where: { id: callLog.id },
                    data: {
                      callStatus: 'answered',
                      callStartedAt: new Date()
                    }
                  });
                  logger.info(`[AMI-Listener] Call log ${callLog.id} status set to answered`);
                }
              }
            } else if (eventName === 'Hangup') {
              logger.info(`[AMI-Listener] Channel hangup: ${channel}`);
              const callLog = await prisma.zaloCallLog.findFirst({
                where: {
                  callStatus: { in: ['initiated', 'ringing', 'answered'] }
                },
                orderBy: { createdAt: 'desc' }
              });
              if (callLog) {
                await prisma.zaloCallLog.update({
                  where: { id: callLog.id },
                  data: {
                    callStatus: 'completed',
                    callEndedAt: new Date()
                  }
                });
                logger.info(`[AMI-Listener] Call log ${callLog.id} status set to completed`);
              }
            }
          }
        } catch (e: any) {
          logger.error(`[AMI-Listener] Error parsing event block: ${e.message}`);
        }
      }
    });

    client.on('close', () => {
      logger.warn('[AMI-Listener] AMI Connection closed. Reconnecting in 5 seconds...');
      scheduleReconnect();
    });

    client.on('error', (err) => {
      logger.error(`[AMI-Listener] Connection error: ${err.message}`);
    });
  };

  const scheduleReconnect = () => {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => connect(), 5000);
  };

  connect();
}


export class ZaloCallService {
  private static instance: ZaloCallService;

  private constructor() {
    logger.info('[ZaloCallService] Initialized with Zalo Call API v2.0');
    startAMIListener();
  }


  public static getInstance(): ZaloCallService {
    if (!ZaloCallService.instance) {
      ZaloCallService.instance = new ZaloCallService();
    }
    return ZaloCallService.instance;
  }

  private async getOAAccount(orgId: string) {
    const db = getTenantPrisma(orgId);
    const oaAccount = await db.zaloOAAccount.findFirst({
      where: { orgId, status: 'connected' }
    });
    if (!oaAccount) throw new Error('Không tìm thấy Zalo OA đang kết nối');
    return oaAccount;
  }

  /**
   * Check if user has granted call permission
   * API: GET https://openapi.zalo.me/v2.0/oa/call/checkconsent
   * Params: data={"phone":"84..."}
   */
  async getConsentStatus(customerId: string, orgId: string) {
    const db = getTenantPrisma(orgId);

    // Find or create local consent record
    let consent = await db.zaloCallConsent.findFirst({
      where: { orgId, contactId: customerId }
    });

    if (!consent) {
      const contact = await db.contact.findFirst({
        where: { orgId, id: customerId }
      });
      if (!contact) throw new Error('Không tìm thấy khách hàng');

      consent = await db.zaloCallConsent.create({
        data: {
          orgId,
          contactId: customerId,
          phone: contact.phone,
          zaloUid: contact.zaloUid,
          status: 'unknown'
        }
      });
    }

    // If we have a phone number, check actual permission from Zalo
    const phoneToCheck = consent.phone;
    if (phoneToCheck) {
      try {
        const oaAccount = await this.getOAAccount(orgId);
        const accessToken = await zaloOAService.getAccessToken(oaAccount.id, orgId);
        const normalizedPhone = normalizePhone(phoneToCheck);

        const response = await axios.get(`${ZALO_CALL_BASE}/checkconsent`, {
          headers: { access_token: accessToken },
          params: { data: JSON.stringify({ phone: normalizedPhone }) }
        });

        logger.info(`[ZaloCallService] Check consent response: ${JSON.stringify(response.data)}`);

        if (response.data.error === 0) {
          // "User approved the request" → granted
          const isGranted = response.data.message?.toLowerCase().includes('approved');
          const expiredTime = response.data.expired_time;
          const isExpired = expiredTime && expiredTime < Date.now();
          const newStatus = (isGranted && !isExpired) ? 'granted' : (consent.status === 'pending' ? 'pending' : 'unknown');

          if (newStatus !== consent.status) {
            consent = await db.zaloCallConsent.update({
              where: { id: consent.id },
              data: { status: newStatus }
            });
          }
        } else if (response.data.error === -216) {
          // User has not approved yet
          if (consent.status !== 'pending') {
            consent = await db.zaloCallConsent.update({
              where: { id: consent.id },
              data: { status: 'unknown' }
            });
          }
        }
      } catch (err: any) {
        logger.warn(`[ZaloCallService] Could not check consent: ${err.message}`);
      }
    }

    return consent;
  }

  /**
   * Send call permission request to user
   * API: POST https://openapi.zalo.me/v2.0/oa/call/requestconsent
   * Body: { phone, call_type, reason_code }
   */
  async requestConsent(customerId: string, agentId: string, orgId: string) {
    const db = getTenantPrisma(orgId);

    const contact = await db.contact.findFirst({
      where: { orgId, id: customerId }
    });
    if (!contact) throw new Error('Không tìm thấy khách hàng');

    if (!contact.phone) {
      throw new Error('Khách hàng chưa có số điện thoại để gửi yêu cầu quyền gọi');
    }

    const oaAccount = await this.getOAAccount(orgId);
    const accessToken = await zaloOAService.getAccessToken(oaAccount.id, orgId);
    const normalizedPhone = normalizePhone(contact.phone);

    const requestBody = {
      phone: normalizedPhone,
      call_type: 'audio',   // audio | video | audio_and_video
      reason_code: 101      // 101: Tư vấn sản phẩm/dịch vụ
    };

    logger.info(`[ZaloCallService] Requesting consent for phone ${normalizedPhone}`);

    const response = await axios.post(
      `${ZALO_CALL_BASE}/requestconsent`,
      requestBody,
      {
        headers: {
          access_token: accessToken,
          'Content-Type': 'application/json'
        }
      }
    );

    logger.info(`[ZaloCallService] Request consent response: ${JSON.stringify(response.data)}`);

    if (response.data.error !== 0) {
      throw new Error(`Zalo API Error: ${response.data.message} (code: ${response.data.error})`);
    }

    // Update DB to pending
    let consent = await db.zaloCallConsent.findFirst({
      where: { orgId, contactId: customerId }
    });

    if (consent) {
      consent = await db.zaloCallConsent.update({
        where: { id: consent.id },
        data: {
          status: 'pending',
          requestedAt: new Date(),
          phone: contact.phone,
          zaloUid: contact.zaloUid
        }
      });
    } else {
      consent = await db.zaloCallConsent.create({
        data: {
          orgId,
          contactId: customerId,
          phone: contact.phone,
          zaloUid: contact.zaloUid,
          status: 'pending',
          requestedAt: new Date()
        }
      });
    }

    return consent;
  }

  /**
   * Initiate outbound call via ZCC SIP Trunk
   *
   * NOTE: There is no REST API to directly trigger a call.
   * The call must be made through the SIP trunk by the agent's softphone/PBX.
   * This method:
   *   1. Verifies consent
   *   2. Creates a call log entry
   *   3. Returns the SIP dial string for the agent to use
   *
   * SIP Trunk format:
   *   FROM: <OAID>@<AppID>.zcc.openapi.zaloapp.com
   *   TO:   <UserID_or_Phone>@<AppID>.zcc.openapi.zaloapp.com
   */
  async makeCall(customerId: string, agentId: string, orgId: string) {
    const db = getTenantPrisma(orgId);

    // Verify consent
    const consent = await this.getConsentStatus(customerId, orgId);
    if (consent.status !== 'granted') {
      throw new Error('Khách hàng chưa cấp quyền nhận cuộc gọi Zalo từ OA');
    }

    const contact = await db.contact.findFirst({
      where: { orgId, id: customerId }
    });
    if (!contact) throw new Error('Không tìm thấy khách hàng');

    const oaAccount = await this.getOAAccount(orgId);
    const appId = oaAccount.appId;
    const oaId = oaAccount.oaId;

    // Destination: prefer Zalo UID, fall back to phone
    const destination = contact.zaloUid || (contact.phone ? normalizePhone(contact.phone) : null);
    if (!destination) throw new Error('Khách hàng không có Zalo UID hoặc số điện thoại');

    const sipServer = `${appId}.zcc.openapi.zaloapp.com`;
    const sipFrom = `${oaId}@${sipServer}`;
    const sipTo = `${destination}@${sipServer}`;

    // Create call log
    const callLog = await db.zaloCallLog.create({
      data: {
        orgId,
        customerId,
        agentId,
        phone: contact.phone,
        zaloUid: contact.zaloUid,
        consentStatus: 'granted',
        callStatus: 'initiated',
        callStartedAt: new Date(),
        sipCallId: `sip-${Date.now()}` // placeholder, real ID comes via webhook
      }
    });

    logger.info(`[ZaloCallService] Call log created: ${callLog.id}. SIP: ${sipFrom} → ${sipTo}`);

    // Trigger Asterisk AMI Originate
    try {
      await originateCallViaAMI('PJSIP/101', destination, appId, oaId);
      logger.info(`[ZaloCallService] Originated Asterisk call to Zalo ZCC: PJSIP/101 -> ${destination}`);
      
      // Update state to ringing
      await db.zaloCallLog.update({
        where: { id: callLog.id },
        data: { callStatus: 'ringing' }
      });
    } catch (err: any) {
      logger.error(`[ZaloCallService] Asterisk Originate failed: ${err.message}`);
      await db.zaloCallLog.update({
        where: { id: callLog.id },
        data: { callStatus: 'failed' }
      });
    }


    return {
      success: true,
      callId: callLog.id,
      status: 'initiated',
      // SIP info for the agent's softphone or WebRTC client
      sipInfo: {
        server: sipServer,
        from: sipFrom,
        to: sipTo,
        destination
      },
      message: `Sẵn sàng gọi! Tổng đài viên quay số ${sipTo} qua SIP trunk ZCC`
    };
  }

  /**
   * Get call history for customer
   */
  async getCallHistory(customerId: string, orgId: string) {
    const db = getTenantPrisma(orgId);
    return db.zaloCallLog.findMany({
      where: { orgId, customerId },
      include: {
        agent: {
          select: { fullName: true, email: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  /**
   * Webhook handler: receive call status update from Zalo
   */
  async handleCallWebhook(orgId: string, event: any) {
    const db = getTenantPrisma(orgId);
    const { call_id, status, duration, recording_url } = event;
    if (!call_id) return;

    const callLog = await db.zaloCallLog.findFirst({
      where: { orgId, sipCallId: String(call_id) }
    });
    if (!callLog) {
      logger.warn(`[ZaloCallService] Webhook: no call log found for call_id=${call_id}`);
      return;
    }

    const statusMap: Record<string, string> = {
      'answered': 'answered',
      'ended':    'completed',
      'rejected': 'no_answer',
      'missed':   'no_answer',
      'busy':     'busy',
      'failed':   'failed'
    };

    const newStatus = statusMap[status] || status;
    const updateData: any = { callStatus: newStatus };
    if (status === 'answered') updateData.callStartedAt = new Date();
    if (['ended', 'rejected', 'missed', 'busy', 'failed'].includes(status)) {
      updateData.callEndedAt = new Date();
      if (duration) updateData.duration = duration;
      if (recording_url) updateData.recordingUrl = recording_url;
    }

    await db.zaloCallLog.update({ where: { id: callLog.id }, data: updateData });
    logger.info(`[ZaloCallService] Webhook: call ${callLog.id} → ${newStatus}`);
  }

  /**
   * Find org by OA ID and handle webhook
   */
  async handleCallWebhookByOaId(oaId: string, event: any) {
    if (!oaId) return;
    const { PrismaClient } = await import('@prisma/client');
    const globalPrisma = new PrismaClient();
    try {
      const oaAccount = await globalPrisma.zaloOAAccount.findFirst({ where: { oaId } });
      if (!oaAccount) return;
      await this.handleCallWebhook(oaAccount.orgId, event);
    } finally {
      await globalPrisma.$disconnect();
    }
  }
}

export const zaloCallService = ZaloCallService.getInstance();
