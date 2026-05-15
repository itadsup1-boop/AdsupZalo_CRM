import { randomUUID } from 'node:crypto';
import { getTenantPrisma } from '../../shared/database/prisma-tenant.js';
import { logger } from '../../shared/utils/logger.js';

export async function syncAllForAccount(accountId: string, orgId: string, api: any) {
  logger.info(`[sync-history:${accountId}] === SYNC STARTING FOR ORG ${orgId} ===`);
  const db = getTenantPrisma(orgId);
  const stats = {
    contactsCreated: 0,
    contactsUpdated: 0,
    groupsCreated: 0,
    messagesSynced: 0,
  };

  logger.info(`[sync-history:${accountId}] Starting metadata sync for account`);

  // 1. Sync Friends list
  try {
    const friendResult = await api.getAllFriends();
    const friends = Object.values(friendResult || {}) as any[];
    logger.info(`[sync-history:${accountId}] Updating ${friends.length} contacts`);

    for (const friend of friends) {
      try {
        const uid = friend.userId || friend.uid || '';
        if (!uid) continue;

        const zaloName = friend.zaloName || friend.zalo_name || friend.displayName || friend.display_name || '';
        const avatar = friend.avatar || '';
        const phone = friend.phoneNumber || '';

        let contact = await db.contact.findFirst({ where: { zaloUid: uid } });
        if (contact) {
          await db.contact.update({
            where: { id: contact.id },
            data: {
              fullName: zaloName || contact.fullName,
              avatarUrl: avatar || contact.avatarUrl,
              phone: phone || contact.phone,
            },
          });
          stats.contactsUpdated++;
        } else {
          contact = await db.contact.create({
            data: {
              id: randomUUID(),
              orgId,
              zaloUid: uid,
              fullName: zaloName || 'Unknown',
              avatarUrl: avatar || null,
              phone: phone || null,
            },
          });
          stats.contactsCreated++;
        }

        // Ensure a conversation exists for this friend
        let conversation = await db.conversation.findFirst({
          where: { zaloAccountId: accountId, externalThreadId: uid }
        });
        if (!conversation) {
          await db.conversation.create({
            data: {
              id: randomUUID(),
              orgId,
              zaloAccountId: accountId,
              contactId: contact.id,
              externalThreadId: uid,
              threadType: 'user',
              lastMessageAt: new Date('2000-01-01'),
            }
          });
        }
      } catch (err) {
        // Skip individual contact error
      }
    }
  } catch (err) {
    logger.error(`[sync-history:${accountId}] Failed to sync friends:`, err);
  }

  // 2. Sync Groups list
  try {
    const groupResult = await api.getAllGroups();
    const groups = Array.isArray(groupResult) ? groupResult : (groupResult?.data || []);
    logger.info(`[sync-history:${accountId}] Found ${groups.length} groups`);

    for (const group of groups) {
      try {
        const groupId = group.groupId || group.id || '';
        if (!groupId) continue;

        const groupName = group.name || group.groupName || 'Nhóm không tên';
        const avatarUrl = group.avatar || group.groupAvatar || '';

        let conversation = await db.conversation.findFirst({
          where: { zaloAccountId: accountId, externalThreadId: groupId }
        });
        if (!conversation) {
          await db.conversation.create({
            data: {
              id: randomUUID(),
              orgId,
              zaloAccountId: accountId,
              externalThreadId: groupId,
              threadType: 'group',
              lastMessageAt: new Date('2000-01-01'),
            }
          });
          stats.groupsCreated++;
        }
      } catch (err) {
        // Skip group error
      }
    }
  } catch (err) {
    logger.error(`[sync-history:${accountId}] Failed to sync groups:`, err);
  }

  // Note: Native sync (requestOldMessages) is disabled as per user request to remove "Lấy tin nhắn cũ".
  logger.info(`[sync-history:${accountId}] Metadata sync complete. Native history sync skipped.`);

  return stats;
}
