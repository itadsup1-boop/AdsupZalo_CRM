/**
 * zalo-sync-routes.ts — Endpoints to sync Zalo friends/contacts to CRM contacts.
 * Requires owner or admin role, or member with explicit account access.
 */
import type { FastifyInstance } from 'fastify';
import { getTenantPrisma } from '../../shared/database/prisma-tenant.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { requireRole } from '../auth/role-middleware.js';
import { zaloPool } from './zalo-pool.js';
import { logger } from '../../shared/utils/logger.js';
import { randomUUID } from 'node:crypto';

export async function zaloSyncRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);

  // Sync all friends from a Zalo account to contacts
  app.post('/api/v1/zalo-accounts/:id/sync-contacts',
    async (request, reply) => {
      const user = request.user!;
      const { id } = request.params as { id: string };
      const db = getTenantPrisma(user.orgId);

      // Check access if user is a member
      if (user.role === 'member') {
        const access = await db.zaloAccountAccess.findFirst({
          where: { zaloAccountId: id, userId: user.id },
        });
        if (!access) {
          return reply.status(403).send({ error: 'Không có quyền truy cập tài khoản Zalo này' });
        }
      }

      const instance = zaloPool.getInstance(id);
      if (!instance?.api) return reply.status(400).send({ error: 'Zalo account not connected' });

      try {
        const result = await instance.api.getAllFriends();
        // getAllFriends returns object with profiles
        const friends = Object.values(result || {}) as any[];
        let created = 0, updated = 0;

        for (const friend of friends) {
          const uid = friend.userId || friend.uid || '';
          if (!uid) continue;

          const zaloName = friend.zaloName || friend.zalo_name || friend.displayName || friend.display_name || '';
          const avatar = friend.avatar || '';
          const phone = friend.phoneNumber || '';

          const db = getTenantPrisma(user.orgId);
          const existing = await db.contact.findFirst({
            where: { zaloUid: uid },
          });

          if (existing) {
            await db.contact.update({
              where: { id: existing.id },
              data: {
                fullName: zaloName || existing.fullName,
                avatarUrl: avatar || existing.avatarUrl,
                phone: phone || existing.phone,
              },
            });
            updated++;
          } else {
            await db.contact.create({
              data: {
                id: randomUUID(),
                orgId: user.orgId,
                zaloUid: uid,
                fullName: zaloName || 'Unknown',
                avatarUrl: avatar || null,
                phone: phone || null,
              },
            });
            created++;
          }
        }

        // Backfill: link orphaned conversations (contactId is null) to contacts
        const linked = await linkOrphanedConversations(id, user.orgId, instance.api);

        logger.info(`[sync] Zalo contacts: ${created} created, ${updated} updated, ${linked} conversations linked`);
        return { success: true, created, updated, linked, total: friends.length };
      } catch (err) {
        logger.error('[sync] Zalo contacts error:', err);
        return reply.status(500).send({ error: 'Sync failed: ' + String(err) });
      }
    }
  );

  // Deep sync everything: friends, groups, and group history
  app.post('/api/v1/zalo-accounts/:id/sync-full', async (request, reply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const db = getTenantPrisma(user.orgId);

    if (user.role === 'member') {
      const access = await db.zaloAccountAccess.findFirst({
        where: { zaloAccountId: id, userId: user.id },
      });
      if (!access) return reply.status(403).send({ error: 'Không có quyền truy cập tài khoản Zalo này' });
    }

    const instance = zaloPool.getInstance(id);
    if (!instance?.api) return reply.status(400).send({ error: 'Zalo account not connected' });

    try {
      const { syncAllForAccount } = await import('./zalo-sync-history.js');
      const stats = await syncAllForAccount(id, user.orgId, instance.api);
      return { success: true, stats };
    } catch (err) {
      logger.error('[sync] Full sync error:', err);
      return reply.status(500).send({ error: 'Full sync failed: ' + String(err) });
    }
  });


}

/**
 * Find conversations with no linked contact and resolve them via Zalo API.
 * Creates missing contacts and links them to their conversations.
 */
async function linkOrphanedConversations(
  accountId: string,
  orgId: string,
  api: any,
): Promise<number> {
  const db = getTenantPrisma(orgId);
  const orphaned = await db.conversation.findMany({
    where: { zaloAccountId: accountId, contactId: null, threadType: 'user' },
    select: { id: true, externalThreadId: true },
  });

  if (orphaned.length === 0) return 0;

  let linked = 0;
  for (const conv of orphaned) {
    const uid = conv.externalThreadId;
    if (!uid) continue;

    // Check if contact already exists for this UID
    let contact = await db.contact.findFirst({
      where: { zaloUid: uid },
      select: { id: true },
    });

    if (!contact) {
      // Resolve name from Zalo API
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
        logger.warn(`[sync] getUserInfo failed for ${uid}:`, err);
      }

      contact = await db.contact.create({
        data: {
          id: randomUUID(),
          orgId: orgId,
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
    linked++;
  }

  logger.info(`[sync] Linked ${linked} orphaned conversations for account ${accountId}`);
  return linked;
}
