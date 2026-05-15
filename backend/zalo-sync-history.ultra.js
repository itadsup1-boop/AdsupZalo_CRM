import { randomUUID } from 'node:crypto';
import { getTenantPrisma } from '../../shared/database/prisma-tenant.js';
import { logger } from '../../shared/utils/logger.js';
import { handleIncomingMessage } from '../chat/message-handler.js';
import { detectContentType } from './zalo-message-helpers.js';

export async function syncAllForAccount(accountId, orgId, api) {
    logger.info(`[massive-sync:${accountId}] === MASSIVE SYNC STARTING ===`);
    const db = getTenantPrisma(orgId);
    const stats = { contactsCreated: 0, contactsUpdated: 0, messagesSynced: 0 };

    try {
        // 1. First, MUST sync friends to create the conversations
        const friendResult = await api.getAllFriends();
        const friends = Object.values(friendResult || {});
        logger.info(`[massive-sync:${accountId}] Found ${friends.length} friends to sync`);

        for (const friend of friends) {
            const uid = String(friend.userId || friend.uid || '');
            if (!uid) continue;
            const zaloName = friend.zaloName || friend.zalo_name || friend.displayName || friend.display_name || 'Unknown';
            
            let contact = await db.contact.findFirst({ where: { zaloUid: uid } });
            if (contact) {
                contact = await db.contact.update({
                    where: { id: contact.id },
                    data: { fullName: zaloName },
                });
                stats.contactsUpdated++;
            } else {
                contact = await db.contact.create({
                    data: { id: randomUUID(), orgId, zaloUid: uid, fullName: zaloName },
                });
                stats.contactsCreated++;
            }

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
        }

        // 2. Now trigger the deep scan for all created conversations
        const convs = await db.conversation.findMany({
            where: { zaloAccountId: accountId, threadType: 'user' },
            select: { externalThreadId: true }
        });

        (async () => {
            logger.info(`[massive-sync:${accountId}] Starting background scan of ${convs.length} users...`);
            for (let i = 0; i < convs.length; i++) {
                const uid = convs[i].externalThreadId;
                try {
                    const board = await api.getFriendBoardList(uid);
                    const msgs = board?.data?.groupMsgs || [];
                    if (msgs.length > 0) {
                        for (const m of msgs) {
                            const rawContent = m.data?.content;
                            const contentType = detectContentType(m.data?.msgType, rawContent);
                            await handleIncomingMessage({
                                accountId,
                                senderUid: String(m.data?.uidFrom || ''),
                                senderName: 'Sync',
                                content: typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent || ''),
                                contentType,
                                msgId: String(m.data?.msgId || ''),
                                timestamp: parseInt(m.data?.ts || String(Date.now())),
                                isSelf: m.isSelf || false,
                                threadId: uid,
                                threadType: 'user',
                                isBackfill: true,
                            });
                        }
                    }
                } catch (e) {}
                await new Promise(r => setTimeout(r, 600)); // Scan faster now
            }
            logger.info(`[massive-sync:${accountId}] === BACKGROUND SCAN COMPLETED ===`);
        })();

    } catch (err) {
        logger.error(`[massive-sync:${accountId}] Failed:`, err);
    }

    return stats;
}
