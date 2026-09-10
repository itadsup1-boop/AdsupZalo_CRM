import type { Server } from 'socket.io';
import { getRedis } from '../../shared/redis-client.js';
import { prisma } from '../../shared/database/prisma-client.js';
import { zaloPool } from './zalo-pool.js';
import { logger } from '../../shared/utils/logger.js';
import { getTenantPrisma } from '../../shared/database/prisma-tenant.js';

const POLL_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

export interface ZaloOnlineContact {
  contactId: string;
  zaloUid: string;
  zaloAccountId: string;
  isOnline: boolean;
  lastActiveAt: number; // timestamp
}

class ZaloOnlineContactsService {
  private io: Server | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  // Local fallback cache if Redis is unavailable: orgId -> zaloUid -> ZaloOnlineContact
  private localCache = new Map<string, Map<string, ZaloOnlineContact>>();

  private extractArrayPayload(payload: any): any[] {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload.data)) return payload.data;
    if (Array.isArray(payload.onlines)) return payload.onlines;
    if (Array.isArray(payload.onlineUsers)) return payload.onlineUsers;
    if (Array.isArray(payload.onlineFriends)) return payload.onlineFriends;
    if (Array.isArray(payload.onlineUserIds)) return payload.onlineUserIds;
    if (Array.isArray(payload.userIds)) return payload.userIds;
    if (payload.profiles && typeof payload.profiles === 'object') return Object.values(payload.profiles);
    if (payload.data && typeof payload.data === 'object') return Object.values(payload.data);
    if (typeof payload === 'object') return Object.values(payload);
    return [];
  }

  private extractZaloUid(value: any): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    return String(value.uid || value.uId || value.userId || value.id || value.zaloId || value.zaloUid || '');
  }

  public setIO(io: Server) {
    this.io = io;
    this.startPolling();
  }

  private startPolling() {
    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = setInterval(() => this.pollAllAccounts(), POLL_INTERVAL_MS);
    // Initial run after a short delay
    setTimeout(() => this.pollAllAccounts(), 10000);
  }

  private async pollAllAccounts() {
    logger.debug('[zalo-online] Starting poll for Zalo online contacts');
    const statuses = zaloPool.getAllStatuses();
    
    // Group accounts by orgId
    const accounts = await prisma.zaloAccount.findMany({
      where: { id: { in: Object.keys(statuses).filter(id => statuses[id] === 'connected') } },
      select: { id: true, orgId: true }
    });

    for (const account of accounts) {
      try {
        await this.pollAccount(account.id, account.orgId);
      } catch (err) {
        logger.error(`[zalo-online] Error polling account ${account.id}:`, err);
      }
    }
  }

  private async pollAccount(accountId: string, orgId: string) {
    const api = zaloPool.getApi(accountId);
    if (!api) return;

    let response;
    try {
      response = await api.getFriendOnlines();
    } catch (err) {
      logger.error(`[zalo-online] api.getFriendOnlines failed for ${accountId}:`, err);
      return;
    }

    const onlineItems = this.extractArrayPayload(response);
    if (!onlineItems.length) {
      logger.debug(`[zalo-online] No online friends returned for ${accountId}`);
      return;
    }

    const redis = await getRedis();
    const redisKey = `zalo:online_contacts:${orgId}`;
    const now = Date.now();
    const db = getTenantPrisma(orgId);

    // Get old states from Redis or Local Cache
    let oldStates: Record<string, string> = {};
    if (redis) {
      oldStates = await redis.hgetall(redisKey) || {};
    } else {
      const orgCache = this.localCache.get(orgId) || new Map();
      orgCache.forEach((val, key) => oldStates[key] = JSON.stringify(val));
    }

    const currentOnlineUids = new Set<string>();

    for (const item of onlineItems) {
      const uid = this.extractZaloUid(item);
      if (!uid || uid === 'undefined') continue;
      
      currentOnlineUids.add(uid);

      // We only care if they are online now
      const isOnline = true; // Since they appeared in getFriendOnlines()

      let contactId = '';
      const oldStateStr = oldStates[uid];
      if (oldStateStr) {
        const oldState: ZaloOnlineContact = JSON.parse(oldStateStr);
        contactId = oldState.contactId;
      }

      // If we don't know the contactId, look it up
      if (!contactId) {
        const contact = await db.contact.findFirst({
          where: { orgId, zaloUid: uid },
          select: { id: true }
        });
        if (contact) {
          contactId = contact.id;
        } else {
          // It's a friend but not in our CRM contacts yet, skip
          continue;
        }
      }

      const newState: ZaloOnlineContact = {
        contactId,
        zaloUid: uid,
        zaloAccountId: accountId,
        isOnline: true,
        lastActiveAt: now
      };

      // Save to cache
      if (redis) {
        await redis.hset(redisKey, uid, JSON.stringify(newState));
        // Expire key so it doesn't leak memory forever if we stop using it
        await redis.expire(redisKey, 3600); // 1 hour TTL for the whole hash
      } else {
        if (!this.localCache.has(orgId)) this.localCache.set(orgId, new Map());
        this.localCache.get(orgId)!.set(uid, newState);
      }

      // Emit if transitioned to online
      if (!oldStateStr || !JSON.parse(oldStateStr).isOnline) {
        this.emitToAuthorizedRooms(accountId, orgId, 'zalo:contact:online', newState);
      }

      // Update DB sparingly (only if we haven't updated in 5 mins)
      let shouldUpdateDb = false;
      if (!oldStateStr) {
        shouldUpdateDb = true;
      } else {
        const oldState: ZaloOnlineContact = JSON.parse(oldStateStr);
        if (now - oldState.lastActiveAt > 5 * 60 * 1000) {
          shouldUpdateDb = true;
        }
      }

      if (shouldUpdateDb) {
        await db.contact.update({
          where: { id: contactId },
          data: { lastActiveAt: new Date(now), presenceUpdatedAt: new Date(now) }
        }).catch(() => {});
      }
    }

    // Now check who went offline
    for (const [uid, stateStr] of Object.entries(oldStates)) {
      const oldState: ZaloOnlineContact = JSON.parse(stateStr);
      // We only process if this contact belonged to this accountId polling
      // Actually, a contact could belong to another accountId. We only check
      // offline if it was previously reported online by THIS accountId.
      if (oldState.zaloAccountId === accountId && oldState.isOnline && !currentOnlineUids.has(uid)) {
        // Mark as offline
        oldState.isOnline = false;
        // Keep lastActiveAt as it was

        if (redis) {
          await redis.hset(redisKey, uid, JSON.stringify(oldState));
        } else {
          this.localCache.get(orgId)?.set(uid, oldState);
        }

        this.emitToAuthorizedRooms(accountId, orgId, 'zalo:contact:offline', oldState);
      }
    }
  }

  private async emitToAuthorizedRooms(accountId: string, orgId: string, eventName: string, payload: any) {
    if (!this.io) return;

    try {
      // Always add admin room
      this.io.to(`org_${orgId}_admins`).emit(eventName, payload);

      // Emit to Zalo Account owner directly
      const account = await prisma.zaloAccount.findUnique({
        where: { id: accountId },
        select: { ownerUserId: true }
      });
      if (account?.ownerUserId) {
        this.io.to(`org_${orgId}_user_${account.ownerUserId}`).emit(eventName, payload);
      }

      // Emit to authorized users (from permission-scope)
      const { getZaloAccountAuthorizedUserIds } = await import('../../shared/utils/permission-scope.js');
      const userIds = await getZaloAccountAuthorizedUserIds(accountId);
      for (const userId of userIds) {
        this.io.to(`org_${orgId}_user_${userId}`).emit(eventName, payload);
      }
    } catch (err) {
      logger.error(`[zalo-online] Failed to emit ${eventName} for ${accountId}:`, err);
    }
  }

  // Called by API route
  public async getOnlineContacts(orgId: string, allowedAccountIds: string[]) {
    const redis = await getRedis();
    const redisKey = `zalo:online_contacts:${orgId}`;
    
    let states: ZaloOnlineContact[] = [];
    if (redis) {
      const statesMap = await redis.hgetall(redisKey);
      states = Object.values(statesMap).map(s => JSON.parse(s));
    } else {
      const orgCache = this.localCache.get(orgId);
      if (orgCache) {
        states = Array.from(orgCache.values());
      }
    }

    // Filter by allowed accounts
    const allowedSet = new Set(allowedAccountIds);
    return states.filter(s => s.isOnline && allowedSet.has(s.zaloAccountId));
  }
}

export const zaloOnlineContactsService = new ZaloOnlineContactsService();
