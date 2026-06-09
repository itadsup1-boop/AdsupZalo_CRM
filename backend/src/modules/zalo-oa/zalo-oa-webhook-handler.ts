import { getTenantPrisma } from '../../shared/database/prisma-tenant.js';
import { logger } from '../../shared/utils/logger.js';
import { randomUUID, createHash } from 'node:crypto';
import { emitWebhook } from '../api/webhook-service.js';
import { Server } from 'socket.io';

export async function handleOAWebhook(body: any, io?: Server) {
  logger.info(`[ZaloOA] Webhook received: ${JSON.stringify(body)}`);
  const { event_name, sender, recipient, message, timestamp, app_id } = body;
  
  // Extract OA ID properly based on event type
  let oaId = body.oa_id;
  if (!oaId) {
    if (event_name?.startsWith('user_send_')) {
      oaId = recipient?.id;
    } else if (event_name?.startsWith('oa_send_')) {
      oaId = sender?.id;
    }
  }
  
  if (!oaId) {
    logger.warn('[ZaloOA] Webhook missing oa_id or cannot determine OA ID');
    return;
  }

  // Find the OA account in DB
  const account = await (async () => {
    const { prisma } = await import('../../shared/database/prisma-client.js');
    return prisma.zaloOAAccount.findFirst({
      where: { 
        OR: [
          { oaId: String(oaId) },
          { appId: String(app_id) } // fallback if test payload uses random oa_id
        ]
      },
      select: { id: true, orgId: true }
    });
  })();

  if (!account) {
    logger.warn(`[ZaloOA] Received webhook for unknown OA ID: ${oaId}`);
    return;
  }

  const db = getTenantPrisma(account.orgId);
  const orgId = account.orgId;

  // 1. Process Messages
  if (['user_send_text', 'user_send_image', 'user_send_link', 'user_send_audio', 'user_send_video', 'user_send_file', 'oa_send_text'].includes(event_name)) {
    const isSelf = event_name === 'oa_send_text';
    const externalUserId = isSelf ? recipient.id : sender.id;
    const msgId = message?.msg_id || `oa-${randomUUID()}`;
    const content = message?.text || '';
    
    // Determine content type
    let contentType = 'text';
    if (event_name.includes('_image')) contentType = 'image';
    else if (event_name.includes('_audio')) contentType = 'audio';
    else if (event_name.includes('_video')) contentType = 'video';
    else if (event_name.includes('_file')) contentType = 'file';
    else if (event_name.includes('_link')) contentType = 'link';

    // Upsert Contact — fetch real profile from Zalo OA API
    let contact = await db.contact.findFirst({
      where: { zaloUid: externalUserId },
      select: { id: true, fullName: true, avatarUrl: true }
    });

    if (!contact) {
      // Fetch real name & avatar from Zalo
      const { zaloOAService } = await import('./zalo-oa-service.js');
      const profile = await zaloOAService.getUserProfile(account.id, orgId, externalUserId);

      contact = await db.contact.create({
        data: {
          id: randomUUID(),
          orgId,
          zaloUid: externalUserId,
          fullName: profile?.name || 'Khách hàng OA',
          avatarUrl: profile?.avatar || null,
          source: 'zalo_oa'
        }
      });
      emitWebhook(orgId, 'contact.created', { contactId: contact.id, fullName: contact.fullName });
    } else if (contact.fullName === 'Khách hàng OA' || !contact.avatarUrl) {
      // Backfill profile for existing contacts with default name or missing avatar
      const { zaloOAService } = await import('./zalo-oa-service.js');
      const profile = await zaloOAService.getUserProfile(account.id, orgId, externalUserId);
      if (profile) {
        await db.contact.update({
          where: { id: contact.id },
          data: {
            fullName: profile.name,
            avatarUrl: profile.avatar || undefined,
          }
        });
      }
    }

    // Find or Create Conversation
    let conversation = await db.conversation.findFirst({
      where: { 
        orgId, 
        zaloOaAccountId: account.id, 
        externalThreadId: externalUserId 
      },
      select: { id: true }
    });

    if (!conversation) {
      conversation = await db.conversation.create({
        data: {
          id: randomUUID(),
          orgId,
          zaloOaAccountId: account.id,
          contactId: contact.id,
          threadType: 'user',
          externalThreadId: externalUserId,
          lastMessageAt: new Date(Number(timestamp)),
          unreadCount: isSelf ? 0 : 1,
          isReplied: isSelf
        }
      });
    }

    // Create Message
    const fingerprint = createHash('sha256')
      .update(`${externalUserId}|${content}|${timestamp}`)
      .digest('hex');

    // Check dedup
    const existing = await db.message.findFirst({
      where: { 
        OR: [
          { zaloMsgId: msgId },
          { messageFingerprint: fingerprint }
        ]
      }
    });

    if (existing) return;

    const newMessage = await db.message.create({
      data: {
        id: randomUUID(),
        orgId,
        conversationId: conversation.id,
        zaloMsgId: msgId,
        senderType: isSelf ? 'self' : 'customer',
        senderUid: externalUserId,
        content: content,
        contentType,
        sentAt: new Date(Number(timestamp)),
        messageFingerprint: fingerprint
      }
    });

    // Update conversation
    await db.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: new Date(Number(timestamp)),
        unreadCount: isSelf ? 0 : { increment: 1 },
        isReplied: isSelf
      }
    });

    // Emit Socket event
    if (io) {
      io.emit('chat:message', {
        accountId: account.id,
        isOA: true,
        message: newMessage,
        conversationId: conversation.id
      });
    }

    // Trigger Webhook
    emitWebhook(orgId, isSelf ? 'message.sent' : 'message.received', {
      messageId: newMessage.id,
      conversationId: conversation.id,
      isOA: true,
      content: newMessage.content
    });
  }

  // 2. Handle Follow/Unfollow
  if (event_name === 'user_follow_oa' || event_name === 'user_unfollow_oa') {
    const follower = body.follower;
    const userId = follower?.id || sender?.id;
    const isFollow = event_name === 'user_follow_oa';
    
    if (userId) {
      await db.contact.updateMany({
        where: { zaloUid: userId, orgId },
        data: {
          metadata: {
            oa_follow: isFollow
          }
        }
      });
      logger.info(`[ZaloOA] User ${userId} ${isFollow ? 'followed' : 'unfollowed'} OA`);
    }
  }

  // 3. Handle Call Events from Zalo Call Center
  // Events: oa_call_user, oa_call_answered, oa_call_end, oa_call_missed, oa_call_rejected
  const callEvents = ['oa_call_user', 'oa_call_answered', 'oa_call_end', 'oa_call_missed', 'oa_call_rejected', 'oa_call_failed'];
  if (callEvents.includes(event_name)) {
    logger.info(`[ZaloOA] Call event received: ${event_name}, data: ${JSON.stringify(body)}`);

    const callData = body.data || body;
    const callId = callData?.call_id || callData?.id;

    // Map Zalo event name to internal status
    const statusMap: Record<string, string> = {
      'oa_call_user':     'ringing',
      'oa_call_answered': 'answered',
      'oa_call_end':      'completed',
      'oa_call_missed':   'no_answer',
      'oa_call_rejected': 'no_answer',
      'oa_call_failed':   'failed'
    };
    const newStatus = statusMap[event_name] || event_name;

    if (callId) {
      // Find call log by Zalo call_id
      const callLog = await db.zaloCallLog.findFirst({
        where: { orgId, sipCallId: String(callId) }
      });

      if (callLog) {
        const updateData: any = { callStatus: newStatus };

        if (event_name === 'oa_call_answered') {
          updateData.callStartedAt = new Date();
        }
        if (['oa_call_end', 'oa_call_missed', 'oa_call_rejected', 'oa_call_failed'].includes(event_name)) {
          updateData.callEndedAt = new Date();
          if (callData?.duration) updateData.duration = callData.duration;
          if (callData?.recording_url) updateData.recordingUrl = callData.recording_url;
        }

        await db.zaloCallLog.update({
          where: { id: callLog.id },
          data: updateData
        });

        logger.info(`[ZaloOA] Call log ${callLog.id} updated: ${newStatus}`);

        // Notify frontend via socket
        if (io) {
          io.to(orgId).emit('call:status', {
            callId: callLog.id,
            status: newStatus,
            customerId: callLog.customerId,
            duration: callData?.duration
          });
        }
      } else {
        logger.warn(`[ZaloOA] No call log found for Zalo call_id=${callId}`);
      }
    }

    // Handle consent granted event
    if (event_name === 'oa_call_user') {
      const zaloUserId = body.sender?.id || callData?.user_id;
      if (zaloUserId) {
        // Find consent record by zaloUid and mark as granted
        const consentRecord = await db.zaloCallConsent.findFirst({
          where: { orgId, zaloUid: String(zaloUserId) }
        });
        if (consentRecord && consentRecord.status === 'pending') {
          await db.zaloCallConsent.update({
            where: { id: consentRecord.id },
            data: { status: 'granted' }
          });
          logger.info(`[ZaloOA] Consent granted for zaloUid=${zaloUserId}`);
          if (io) {
            io.to(orgId).emit('call:consent', {
              contactId: consentRecord.contactId,
              status: 'granted'
            });
          }
        }
      }
    }
  }
}
