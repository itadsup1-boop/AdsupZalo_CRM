import { randomUUID } from 'node:crypto';
import { getTenantPrisma } from '../../shared/database/prisma-tenant.js';
import { logger } from '../../shared/utils/logger.js';
import { handleIncomingMessage } from '../chat/message-handler.js';
import { detectContentType, extractAlbumInfo } from './zalo-message-helpers.js';
// ThreadType values from zca-js (0 = User/Individual, 1 = Group)
var ThreadType;
(function (ThreadType) {
    ThreadType[ThreadType["User"] = 0] = "User";
    ThreadType[ThreadType["Group"] = 1] = "Group";
})(ThreadType || (ThreadType = {}));
export async function syncAllForAccount(accountId, orgId, api) {
    logger.info(`[sync-history:${accountId}] === DEEP SYNC STARTING FOR ORG ${orgId} ===`);
    const db = getTenantPrisma(orgId);
    const stats = {
        contactsCreated: 0,
        contactsUpdated: 0,
        groupsCreated: 0,
        messagesSynced: 0,
    };
    logger.info(`[sync-history:${accountId}] Starting deep scan for account`);
    // 1. Sync Friends list
    try {
        const friendResult = await api.getAllFriends();
        const friends = Object.values(friendResult || {});
        logger.info(`[sync-history:${accountId}] Updating ${friends.length} contacts and fetching history...`);
        for (const friend of friends) {
            try {
                const uid = friend.userId || friend.uid || '';
                if (!uid)
                    continue;
                const zaloName = friend.zaloName || friend.zalo_name || friend.displayName || friend.display_name || '';
                const avatar = friend.avatar || '';
                const phone = friend.phoneNumber || '';
                let contact = await db.contact.findFirst({ where: { zaloUid: uid } });
                if (contact) {
                    contact = await db.contact.update({
                        where: { id: contact.id },
                        data: {
                            fullName: zaloName || contact.fullName,
                            avatarUrl: avatar || contact.avatarUrl,
                            phone: phone || contact.phone,
                        },
                    });
                    stats.contactsUpdated++;
                }
                else {
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
                let conversation = await db.conversation.findFirst({
                    where: { zaloAccountId: accountId, externalThreadId: uid }
                });
                if (!conversation) {
                    conversation = await db.conversation.create({
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
                // DEEP SCAN: Fetch history for this friend
                if (api.getFriendBoardList) {
                    const boardResult = await api.getFriendBoardList(uid);
                    const messages = boardResult?.data?.groupMsgs || [];
                    if (messages.length > 0) {
                        for (const msg of messages) {
                            const rawContent = msg.data?.content;
                            const contentType = detectContentType(msg.data?.msgType, rawContent);
                            const album = extractAlbumInfo(contentType, rawContent);
                            await handleIncomingMessage({
                                accountId,
                                senderUid: String(msg.data?.uidFrom || ''),
                                senderName: zaloName,
                                content: typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent || ''),
                                contentType,
                                msgId: String(msg.data?.msgId || ''),
                                timestamp: parseInt(msg.data?.ts || String(Date.now())),
                                isSelf: msg.isSelf || false,
                                threadId: uid,
                                threadType: 'user',
                                attachments: [],
                                quote: msg.data?.quote,
                                albumKey: album.albumKey,
                                albumIndex: album.albumIndex,
                                albumTotal: album.albumTotal,
                                isBackfill: true,
                            });
                            stats.messagesSynced++;
                        }
                    }
                }
            }
            catch (err) {
                // Skip individual error
            }
        }
    }
    catch (err) {
        logger.error(`[sync-history:${accountId}] Failed to sync friends:`, err);
    }
    // 2. Sync Groups
    try {
        const groupResult = await api.getAllGroups();
        const groups = Array.isArray(groupResult) ? groupResult : (groupResult?.data || []);
        for (const group of groups) {
            try {
                const groupId = group.groupId || group.id || '';
                if (!groupId) continue;
                let conversation = await db.conversation.findFirst({
                    where: { zaloAccountId: accountId, externalThreadId: groupId }
                });
                if (!conversation) {
                    conversation = await db.conversation.create({
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
                if (api.getGroupChatHistory) {
                    const history = await api.getGroupChatHistory(groupId, 50);
                    const messages = history?.groupMsgs || [];
                    for (const msg of messages) {
                        const rawContent = msg.data?.content;
                        const contentType = detectContentType(msg.data?.msgType, rawContent);
                        const album = extractAlbumInfo(contentType, rawContent);
                        await handleIncomingMessage({
                            accountId,
                            senderUid: String(msg.data?.uidFrom || ''),
                            senderName: group.name || 'Group',
                            content: typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent || ''),
                            contentType,
                            msgId: String(msg.data?.msgId || ''),
                            timestamp: parseInt(msg.data?.ts || String(Date.now())),
                            isSelf: msg.isSelf || false,
                            threadId: groupId,
                            threadType: 'group',
                            attachments: [],
                            quote: msg.data?.quote,
                            albumKey: album.albumKey,
                            albumIndex: album.albumIndex,
                            albumTotal: album.albumTotal,
                            isBackfill: true,
                        });
                        stats.messagesSynced++;
                    }
                }
            }
            catch (err) {}
        }
    }
    catch (err) {}
    // 3. Trigger native listener sync as backup
    try {
        const listener = api.listener || api.zalo?.listener;
        if (listener && typeof listener.requestOldMessages === 'function') {
            listener.requestOldMessages(ThreadType.User);
            listener.requestOldMessages(ThreadType.Group);
        }
    }
    catch (err) {}
    return stats;
}
