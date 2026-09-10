/**
 * ZaloAccountPool — singleton that manages live Zalo SDK instances.
 * Handles QR login, session reconnect, message listener lifecycle,
 * and credential persistence to the database.
 *
 * Note: zca-js is imported via createRequire because its TypeScript
 * declarations don't expose named exports in ESM mode.
 */
import { createRequire } from 'module';
import type { Server } from 'socket.io';
import { prisma } from '../../shared/database/prisma-client.js';
import { getTenantPrisma } from '../../shared/database/prisma-tenant.js';
import { logger } from '../../shared/utils/logger.js';
import { attachZaloListener, type UserInfoCacheEntry } from './zalo-listener-factory.js';
import { emitWebhook } from '../api/webhook-service.js';
import { startMessageSync, stopMessageSync } from './zalo-message-sync.js';
import { runZaloMessageBackfill } from './zalo-message-backfill.js';
import { metrics } from '../../shared/utils/metrics.js';

// zca-js has no reliable ESM type exports — load via CJS interop
const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Zalo } = require('zca-js') as { Zalo: new (opts: { logging: boolean; selfListen?: boolean; imageMetadataGetter?: (path: string) => Promise<{ size: number; width: number; height: number } | null> }) => any };
const sizeOf = require('image-size').imageSize;
const fs_promises = require('node:fs/promises');
const DISCONNECT_ALERT_THRESHOLD = 5;
const DISCONNECT_WINDOW_MS = 5 * 60_000;
const RECOVER_RETRY_BASE_MS = 5_000;

interface ZaloCredentials {
  cookie: any;
  imei: string;
  userAgent: string;
}



interface ZaloInstance {
  zalo: any;
  api: any;
  page?: any; // Lưu trữ Puppeteer Page nếu có
  orgId: string;
  generation: number;
  status: 'connected' | 'disconnected' | 'qr_pending' | 'connecting' | 'unhealthy' | 'hydrating';
  displayName?: string;
  zaloUid?: string;
  lastActivity: Date;
  metrics: {
    memory: number; // MB
    cpu: number;    // %
    latency: number; // ms
  };
  retryCount: number;
}

class ZaloAccountPool {
  private instances = new Map<string, ZaloInstance>();
  public io: Server | null = null;
  private userInfoCache = new Map<string, UserInfoCacheEntry>();
  private disconnectHistory = new Map<string, number[]>();
  private recoveryTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private retiredListenerGenerations = new Set<string>();
  private instanceGeneration = 0;

  constructor() {
    this.startHeartbeat();
    this.startAutoRecovery();
  }

  private async getAuthorizedRoomsForAccount(accountId: string, orgId: string): Promise<string[]> {
    const rooms = new Set<string>();
    try {
      // Always add admin room
      rooms.add(`org_${orgId}_admins`);

      // Add Zalo Account owner directly
      const account = await prisma.zaloAccount.findUnique({
        where: { id: accountId },
        select: { ownerUserId: true }
      });
      if (account?.ownerUserId) {
        rooms.add(`org_${orgId}_user_${account.ownerUserId}`);
      }

      const { getZaloAccountAuthorizedUserIds } = await import('../../shared/utils/permission-scope.js');
      const userIds = await getZaloAccountAuthorizedUserIds(accountId);
      for (const userId of userIds) {
        rooms.add(`org_${orgId}_user_${userId}`);
      }
    } catch (err) {
      logger.error('[zalo:pool] Failed to get authorized rooms:', err);
    }
    return Array.from(rooms);
  }

  private async emitToAuthorized(accountId: string, orgId: string, event: string, payload: any) {
    if (!this.io) return;
    this.io.to(`account:${accountId}`).emit(event, payload);
    const rooms = await this.getAuthorizedRoomsForAccount(accountId, orgId);
    for (const room of rooms) {
      this.io.to(room).emit(event, payload);
    }
  }

  // 3.3 Browser Heartbeat (Mỗi 15s)
  private startHeartbeat() {
    setInterval(() => {
      metrics.activeBrowsers.set(this.instances.size); // Cập nhật số lượng browser active
      
      this.instances.forEach((instance, accountId) => {
        // Giả lập lấy metrics từ Browser Node
        instance.metrics = {
          memory: Math.floor(Math.random() * 200) + 300, // 300-500MB per profile
          cpu: Math.floor(Math.random() * 20),
          latency: Math.floor(Math.random() * 100),
        };

        const heartbeat = {
          browserId: accountId,
          status: instance.status === 'connected' ? 'healthy' : 'unhealthy',
          ...instance.metrics,
          timestamp: new Date().toISOString(),
        };

        // Gửi tới Browser Manager Service (hoặc Emit Socket cho Admin UI) - Scoped to admins in org
        prisma.user.findMany({
          where: { orgId: instance.orgId, role: { in: ['admin', 'owner'] }, isActive: true },
          select: { id: true }
        }).then(admins => {
          for (const admin of admins) {
            this.io?.to(`org_${instance.orgId}_user_${admin.id}`).emit('browser:heartbeat', heartbeat);
          }
        }).catch(err => logger.error('[zalo:pool] Heartbeat error:', err));
        
        if (instance.status !== 'connected') {
          logger.warn(`[browser:manager] Node ${accountId} is unhealthy: ${instance.status}`);
        }
      });
    }, 15000);
  }

  // 3.4 Auto Recovery (Tự động khởi động lại nếu sập)
  private startAutoRecovery() {
    setInterval(async () => {
      for (const [accountId, instance] of this.instances.entries()) {
        if (instance.status === 'disconnected' || instance.status === 'unhealthy') {
          if (instance.retryCount < 5) {
            logger.info(`[browser:recovery] Attempting restart for ${accountId} (Attempt ${instance.retryCount + 1})`);
            instance.retryCount++;
            instance.status = 'connecting';
            this.autoReconnect(accountId).catch((err) => {
              logger.error(`[browser:recovery] Auto reconnect failed for ${accountId}:`, err);
            });
          } else {
            logger.error(`[browser:recovery] Max retries reached for ${accountId}. Manual intervention required.`);
          }
        }
      }
    }, 60000); // Kiểm tra recovery mỗi phút
  }



  setIO(io: Server): void {
    this.io = io;
  }

  private createZaloInstance(accountId: string) {
    // 3.1 Browser Node: 1 chrome profile = 1 zalo account
    const userDataDir = `./browser-profiles/${accountId}`;
    
    return new Zalo({ 
      logging: false, 
      selfListen: true,
      // @ts-ignore - Giả định SDK hỗ trợ truyền userDataDir hoặc Profile
      storagePath: userDataDir, 
      imageMetadataGetter: async (filePath: string) => {
        try {
          const buffer = await fs_promises.readFile(filePath);
          const stats = await fs_promises.stat(filePath);
          const dimensions = sizeOf(buffer);
          return {
            size: stats.size,
            width: dimensions.width || 0,
            height: dimensions.height || 0
          };
        } catch (err) {
          logger.error('[zalo:metadata] Failed to get image metadata:', err);
          return null;
        }
      }
    });
  }

  private stopExistingInstance(accountId: string): void {
    const existing = this.instances.get(accountId);
    if (existing) {
      const generationKey = `${accountId}:${existing.generation}`;
      this.retiredListenerGenerations.add(generationKey);
      setTimeout(() => {
        this.retiredListenerGenerations.delete(generationKey);
      }, 60_000);
    }

    if (existing?.api?.listener) {
      try {
        existing.api.listener.stop();
      } catch (err) {
        logger.warn(`[zalo:${accountId}] Error stopping old listener:`, err);
      }
    }
    const timer = this.recoveryTimers.get(accountId);
    if (timer) {
      clearTimeout(timer);
      this.recoveryTimers.delete(accountId);
    }
    stopMessageSync(accountId);
  }

  private scheduleRecovery(accountId: string, orgId: string, delayMs: number): void {
    const currentTimer = this.recoveryTimers.get(accountId);
    if (currentTimer) clearTimeout(currentTimer);

    const timer = setTimeout(() => {
      this.recoveryTimers.delete(accountId);
      const latest = this.instances.get(accountId);
      if (latest && latest.status !== 'connected') {
        this.autoReconnect(accountId).catch((err) => {
          logger.error(`[zalo:${accountId}] Recovery reconnect failed:`, err);
        });
      }
    }, delayMs);

    this.recoveryTimers.set(accountId, timer);
    logger.info(`[zalo:${accountId}] Scheduled recovery in ${delayMs}ms for org ${orgId}`);
  }

  // Initiate QR-based login; emits QR events to frontend via Socket.IO
  async loginQR(accountId: string, orgId: string): Promise<void> {
    const db = getTenantPrisma(orgId);
    this.stopExistingInstance(accountId);
    const zalo = this.createZaloInstance(accountId);
    const generation = ++this.instanceGeneration;
    
    this.instances.set(accountId, { 
      zalo, 
      api: null, 
      orgId,
      generation,
      status: 'qr_pending', 
      lastActivity: new Date(),
      metrics: { memory: 0, cpu: 0, latency: 0 },
      retryCount: 0
    });

    try {
      const api = await zalo.loginQR({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
      }, (event: any) => {
        switch (event.type) {
          case 0: // QRCodeGenerated
            this.io?.to(`account:${accountId}`).emit('zalo:qr', { accountId, qrImage: event.data.image });
            break;
          case 1: // QRCodeExpired
            this.io?.to(`account:${accountId}`).emit('zalo:qr-expired', { accountId });
            event.actions?.retry();
            break;
          case 2: // QRCodeScanned
            this.io?.to(`account:${accountId}`).emit('zalo:scanned', {
              accountId,
              displayName: event.data.display_name,
              avatar: event.data.avatar,
            });
            break;
          case 4: // GotLoginInfo
            this.saveCredentials(accountId, orgId, {
              cookie: event.data.cookie,
              imei: event.data.imei,
              userAgent: event.data.userAgent,
            });
            break;
        }
      });

      const instance = this.instances.get(accountId);
      if (!instance || instance.generation !== generation) return;
      instance.api = api;
      instance.status = 'connected';
      instance.lastActivity = new Date();

      const ownId = await api.getOwnId();
      instance.zaloUid = ownId;

      // Fetch own profile info for avatar
      try {
        const userInfo = await api.getUserInfo(ownId);
        const profiles = userInfo?.changed_profiles || {};
        const profile = profiles[ownId] || profiles[`${ownId}_0`];
        if (profile?.avatar) {
          await db.zaloAccount.update({
            where: { id: accountId },
            data: { avatarUrl: profile.avatar, displayName: profile.zaloName || profile.zalo_name || profile.displayName || instance.displayName },
          });
        }
      } catch {}

      this.attachListener(accountId, orgId, api, generation);
      await this.emitToAuthorized(accountId, orgId, 'zalo:connected', { accountId, zaloUid: ownId });
      await this.updateAccountDB(accountId, orgId, 'connected', ownId);
      this.runPostConnectBackfill(accountId, orgId, api, 'qr_login');
      // Emit webhook (orgId lookup is async, fire-and-forget)
      emitWebhook(orgId, 'zalo.connected', { accountId })
        .catch(() => {});

      // Fire-and-forget: link orphaned conversations on login
      this.backfillOrphanedConversations(accountId, api).catch((err) => {
        logger.warn(`[zalo:${accountId}] Backfill orphaned conversations failed:`, err);
      });
    } catch (err) {
      const instance = this.instances.get(accountId);
      if (instance) instance.status = 'disconnected';
      await this.emitToAuthorized(accountId, orgId, 'zalo:error', { accountId, error: String(err) });
      throw err;
    }
  }

  // Reconnect using previously saved session credentials
  async reconnect(accountId: string, orgId: string, credentials: ZaloCredentials): Promise<void> {
    const existing = this.instances.get(accountId);
    if (existing?.status === 'connecting' || existing?.status === 'connected') {
      logger.info(`[zalo:${accountId}] Reconnect skipped: already ${existing.status}`);
      return;
    }
    const db = getTenantPrisma(orgId);
    this.stopExistingInstance(accountId);
    const zalo = this.createZaloInstance(accountId);
    const generation = ++this.instanceGeneration;
    this.instances.set(accountId, { 
      zalo, 
      api: null, 
      orgId,
      generation,
      status: 'connecting', 
      lastActivity: new Date(),
      metrics: { memory: 0, cpu: 0, latency: 0 },
      retryCount: 0
    });

    try {
      const api = await zalo.login({
        cookie: credentials.cookie,
        imei: credentials.imei,
        userAgent: credentials.userAgent,
      });

      const instance = this.instances.get(accountId);
      if (!instance || instance.generation !== generation) return;
      instance.api = api;
      instance.status = 'connected';
      instance.lastActivity = new Date();

      const ownId = await api.getOwnId();
      instance.zaloUid = ownId;

      // Fetch own profile info for avatar
      try {
        const userInfo = await api.getUserInfo(ownId);
        const profiles = userInfo?.changed_profiles || {};
        const profile = profiles[ownId] || profiles[`${ownId}_0`];
        if (profile?.avatar) {
          await db.zaloAccount.update({
            where: { id: accountId },
            data: { avatarUrl: profile.avatar, displayName: profile.zaloName || profile.zalo_name || profile.displayName || instance.displayName },
          });
        }
      } catch {}

      this.attachListener(accountId, orgId, api, generation);
      await this.updateAccountDB(accountId, orgId, 'connected', ownId);
      await this.emitToAuthorized(accountId, orgId, 'zalo:connected', { accountId, zaloUid: ownId });
      this.runPostConnectBackfill(accountId, orgId, api, 'reconnect');
      emitWebhook(orgId, 'zalo.connected', { accountId })
        .catch(() => {});

      // Fire-and-forget: link orphaned conversations on reconnect
      this.backfillOrphanedConversations(accountId, api).catch((err) => {
        logger.warn(`[zalo:${accountId}] Backfill orphaned conversations failed:`, err);
      });
    } catch (err) {
      const instance = this.instances.get(accountId);
      
      const errStr = String(err).toLowerCase();
      const isNetworkError = errStr.includes('network') || 
                             errStr.includes('timeout') || 
                             errStr.includes('fetch') || 
                             errStr.includes('eai_again') || 
                             errStr.includes('enotfound') || 
                             errStr.includes('econnrefused') || 
                             errStr.includes('econnreset') ||
                             errStr.includes('socket') ||
                             errStr.includes('dns');
      
      if (instance) instance.status = isNetworkError ? 'unhealthy' : 'disconnected';
      const targetStatus = isNetworkError ? 'reconnecting' : 'need_qr';
      logger.warn(`[zalo:${accountId}] Reconnect failed due to ${isNetworkError ? 'network' : 'session/auth'} issue: ${err}. Setting DB status to ${targetStatus}`);
      await this.updateAccountDB(accountId, orgId, targetStatus, null, String(err));
      if (isNetworkError) {
        await this.emitToAuthorized(accountId, orgId, 'zalo:recovering', { accountId });
        this.scheduleRecovery(accountId, orgId, 30_000);
      }
      await this.emitToAuthorized(accountId, orgId, 'zalo:reconnect-failed', { accountId, error: String(err), isNetworkError });
    }
  }

  // Delegate listener setup to zalo-listener-factory
  private attachListener(accountId: string, orgId: string, api: any, generation: number): void {
    const generationKey = `${accountId}:${generation}`;
    attachZaloListener({
      accountId,
      orgId,
      api,
      io: this.io,
      userInfoCache: this.userInfoCache,
      zaloUid: this.instances.get(accountId)?.zaloUid,
      onConnected: (id) => {
        const inst = this.instances.get(id);
        if (!inst || inst.generation !== generation || this.retiredListenerGenerations.has(generationKey)) {
          logger.debug(`[zalo:${id}] Ignoring connected event from stale listener generation ${generation}`);
          return;
        }
        if (inst) {
          inst.status = 'connected';
          inst.lastActivity = new Date();
          inst.retryCount = 0; // Reset recovery retry count
        }
        const timer = this.recoveryTimers.get(id);
        if (timer) {
          clearTimeout(timer);
          this.recoveryTimers.delete(id);
        }
        this.disconnectHistory.delete(`dc_${id}`);
        this.updateAccountDB(id, orgId, 'connected', inst?.zaloUid || null);
        this.emitToAuthorized(id, orgId, 'zalo:connected', { accountId: id, zaloUid: inst?.zaloUid || '' });
      },
      onDisconnected: async (id) => {
          const inst = this.instances.get(id);
          if (!inst || inst.generation !== generation || this.retiredListenerGenerations.has(generationKey)) {
            logger.debug(`[zalo:${id}] Ignoring disconnected event from stale listener generation ${generation}`);
            return;
          }
          const msSinceLastActivity = inst?.lastActivity
            ? Date.now() - inst.lastActivity.getTime()
            : Number.POSITIVE_INFINITY;
          const now = Date.now();
          const key = `dc_${id}`;
          const history = (this.disconnectHistory.get(key) || []).filter(t => now - t < DISCONNECT_WINDOW_MS);
          history.push(now);
          this.disconnectHistory.set(key, history);

          logger.warn(`[zalo:${id}] Listener closed after ${msSinceLastActivity}ms. Keeping account session alive and recovering listener (${history.length}/${DISCONNECT_ALERT_THRESHOLD}).`);
          inst.status = history.length >= DISCONNECT_ALERT_THRESHOLD ? 'unhealthy' : 'connected';
          await this.updateAccountDB(id, orgId, 'connected', inst.zaloUid || null);
          await this.emitToAuthorized(id, orgId, 'zalo:recovering', { accountId: id });

        if (history.length >= DISCONNECT_ALERT_THRESHOLD) {
          // Keep the account marked connected because only the listener loop is unstable;
          // full session/auth failures are handled by reconnect/login errors.
          logger.warn(`[zalo:${id}] Listener closed ${history.length} times in 5 min. Cooling down listener recovery without marking account disconnected.`);
          this.emitToAuthorized(id, orgId, 'zalo:reconnect-failed', { 
            accountId: id, 
            error: 'Luồng nghe tin nhắn Zalo không ổn định. Hệ thống đang thử khôi phục nền.',
            isNetworkError: true 
          });
          
          setTimeout(() => {
            this.disconnectHistory.delete(key); // Clear history after cooling off
            this.autoReconnect(id);
          }, 5 * 60_000);
          return; // Skip normal 30s reconnect
        }

        this.scheduleRecovery(id, orgId, Math.min(RECOVER_RETRY_BASE_MS * history.length, 30_000));
      },
    });

    // Start periodic group message sync backup
    startMessageSync(api, accountId, orgId);
  }

  // Persist session credentials to DB
  private saveCredentials(accountId: string, orgId: string, credentials: ZaloCredentials): void {
    const db = getTenantPrisma(orgId);
    db.zaloAccount
      .update({ where: { id: accountId }, data: { sessionData: credentials as any } })
      .catch((err: any) => logger.error(`[zalo:${accountId}] saveCredentials error:`, err));
  }

  private runPostConnectBackfill(accountId: string, orgId: string, api: any, reason: string): void {
    setTimeout(() => {
      runZaloMessageBackfill({ accountId, orgId, api, reason, requestOldMessages: true })
        .then((stats) => {
          logger.info(`[zalo:${accountId}] Post-connect backfill finished`, stats);
        })
        .catch((err) => {
          logger.warn(`[zalo:${accountId}] Post-connect backfill failed:`, err);
        });
    }, 1500);
  }

  // Sync account status and zaloUid to DB
  private async updateAccountDB(accountId: string, orgId: string, status: string, zaloUid: string | null, error?: string | null): Promise<void> {
    const db = getTenantPrisma(orgId);
    try {
      const now = new Date();
      await db.zaloAccount.update({
        where: { id: accountId },
        data: {
          status,
          ...(zaloUid !== null ? { zaloUid } : {}),
          ...(status === 'connected' ? { lastConnectedAt: now, lastReconnectAt: now, connectionError: null } : {}),
          ...(status === 'disconnected' || status === 'need_qr' ? { disconnectedAt: now, connectionError: error || null } : {}),
          ...(status === 'reconnecting' ? { lastReconnectAt: now, connectionError: error || null } : {}),
        },
      });
    } catch (err) {
      logger.error(`[zalo:${accountId}] updateAccountDB error:`, err);
    }
  }

  // Auto-reconnect using saved session from DB
  private async autoReconnect(accountId: string): Promise<void> {
    const inst = this.instances.get(accountId);
    // Skip if already reconnected or manually disconnected
    if (inst?.status === 'connected') return;

    try {
      const account = await prisma.zaloAccount.findUnique({
        where: { id: accountId },
        select: { orgId: true, sessionData: true },
      });
      const session = account?.sessionData as ZaloCredentials | null;
      if (session?.imei) {
        logger.info(`[zalo:${accountId}] Auto-reconnecting...`);
        await this.reconnect(accountId, account!.orgId, session);
      } else {
        logger.warn(`[zalo:${accountId}] No saved session, cannot auto-reconnect`);
        await this.emitToAuthorized(accountId, account!.orgId, 'zalo:reconnect-failed', { accountId, error: 'No saved session' });
      }
    } catch (err) {
      logger.error(`[zalo:${accountId}] Auto-reconnect failed:`, err);
      // Retry again in 2 minutes
      setTimeout(() => this.autoReconnect(accountId), 120_000);
    }
  }

  // Stop listener and remove from pool
  disconnect(accountId: string): void {
    const timer = this.recoveryTimers.get(accountId);
    if (timer) {
      clearTimeout(timer);
      this.recoveryTimers.delete(accountId);
    }
    this.disconnectHistory.delete(`dc_${accountId}`);

    const instance = this.instances.get(accountId);
    if (instance?.api?.listener) {
      try { instance.api.listener.stop(); } catch (err) {
        logger.warn(`[zalo:${accountId}] Error stopping listener:`, err);
      }
    }
    stopMessageSync(accountId);
    this.instances.delete(accountId);
  }

  getStatus(accountId: string): string {
    return this.instances.get(accountId)?.status ?? 'disconnected';
  }

  getAllStatuses(): Record<string, string> {
    const statuses: Record<string, string> = {};
    for (const [id, inst] of this.instances) statuses[id] = inst.status;
    return statuses;
  }

  // Return raw API instance for direct SDK calls (e.g. public API send message)
  getApi(accountId: string): any | null {
    const inst = this.instances.get(accountId);
    return inst?.status === 'connected' ? inst.api : null;
  }

  getInstance(accountId: string): ZaloInstance | undefined {
    return this.instances.get(accountId);
  }

  // Link orphaned conversations (contactId is null) to contacts via Zalo API
  private async backfillOrphanedConversations(accountId: string, api: any): Promise<void> {
    const account = await prisma.zaloAccount.findUnique({
      where: { id: accountId },
      select: { orgId: true },
    });
    if (!account) return;

    const db = getTenantPrisma(account.orgId);
    const orphaned = await db.conversation.findMany({
      where: { zaloAccountId: accountId, contactId: null, threadType: 'user' },
      select: { id: true, externalThreadId: true },
    });

    if (orphaned.length === 0) return;
    logger.info(`[zalo:${accountId}] Backfilling ${orphaned.length} orphaned conversation(s)`);

    for (const conv of orphaned) {
      const uid = conv.externalThreadId;
      if (!uid) continue;

      let contact = await db.contact.findFirst({
        where: { zaloUid: uid },
        select: { id: true },
      });

      if (!contact) {
        let zaloName = '';
        let avatar = '';
        let phone = '';
        try {
          const result = await api.getUserInfo(uid);
          const profiles = result?.changed_profiles || {};
          const profile = profiles[uid] || profiles[`${uid}_0`];
          if (profile) {
            zaloName = profile.zaloName || profile.zalo_name || profile.displayName || profile.display_name || '';
            avatar = profile.avatar || '';
            phone = profile.phoneNumber || '';
          }
        } catch (err) {
          logger.warn(`[zalo:${accountId}] getUserInfo failed for ${uid}:`, err);
        }

        const { randomUUID } = await import('node:crypto');
        contact = await db.contact.create({
          data: {
            id: randomUUID(),
            orgId: account.orgId,
            zaloUid: uid,
            fullName: zaloName || 'Unknown',
            avatarUrl: avatar || null,
            phone: phone || null,
          },
          select: { id: true },
        });
      }

      await db.conversation.update({
        where: { id: conv.id },
        data: { contactId: contact.id },
      });
    }

    logger.info(`[zalo:${accountId}] Backfill complete: ${orphaned.length} conversation(s) linked`);
  }
}

export const zaloPool = new ZaloAccountPool();
