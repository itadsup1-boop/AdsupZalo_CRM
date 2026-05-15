/**
 * message-handler.ts — persists incoming Zalo messages to the database.
 * Called from zalo-pool's startListener on every 'message' / 'undo' event.
 */
import { prisma } from '../../shared/database/prisma-client.js';
import { getTenantPrisma } from '../../shared/database/prisma-tenant.js';
import { logger } from '../../shared/utils/logger.js';
import { randomUUID, createHash } from 'node:crypto';
import { emitWebhook } from '../api/webhook-service.js';
import { runAutomationRules } from '../automation/automation-service.js';

function generateMessageFingerprint(senderId: string, content: string, timestamp: number): string {
  // Round timestamp to nearest 5 seconds to handle slight clock skews
  const roundedTs = Math.floor(timestamp / 5000) * 5000;
  const raw = `${senderId}|${content}|${roundedTs}`;
  return createHash('sha256').update(raw).digest('hex');
}

export interface IncomingMessage {
  accountId: string;
  senderUid: string;
  senderName: string;       // zaloName (from cache or dName fallback)
  content: string;
  contentType: string;      // text, image, sticker, video, voice, gif, link, file
  msgId: string;
  timestamp: number;        // epoch ms
  isSelf: boolean;
  threadId: string;         // For user: contact UID. For group: group ID
  threadType: 'user' | 'group'; // user or group conversation
  groupName?: string;       // group name if group message
  attachments?: any[];
  quote?: unknown;
  albumKey?: string | null;
  albumIndex?: number | null;
  albumTotal?: number | null;
  isBackfill?: boolean;     // true for old_messages / sync backfill — skip automations
}

export interface HandleMessageResult {
  message: {
    id: string;
    conversationId: string;
    zaloMsgId: string | null;
    senderType: string;
    senderUid: string | null;
    senderName: string | null;
    content: string | null;
    contentType: string;
    attachments: any;
    albumKey: string | null;
    albumIndex: number | null;
    albumTotal: number | null;
    isDeleted: boolean;
    deletedAt: Date | null;
    sentAt: Date;
    repliedByUserId: string | null;
    createdAt: Date;
  };
  conversationId: string;
  orgId: string;
  contactId: string | null;
}

export async function handleIncomingMessage(
  msg: IncomingMessage,
  providedAccount?: { orgId: string; ownerUserId: string | null }
): Promise<HandleMessageResult | null> {
  try {
    let account = providedAccount;

    if (!account) {
      account = await prisma.zaloAccount.findUnique({
        where: { id: msg.accountId },
        select: { orgId: true, ownerUserId: true },
      }) as any;
    }
    
    if (!account) return null;

    const db = getTenantPrisma(account.orgId);
    const contactId = await upsertContact(db, msg, account.orgId);

    // Update lastActivity for lead scoring freshness
    if (contactId) {
      db.contact.update({
        where: { id: contactId },
        data: { lastActivity: new Date() },
      }).catch(() => {});
    }

    // Consistency Check 1: Ensure contact belongs to the correct org
    if (contactId) {
      const contactCheck = await prisma.contact.findUnique({ where: { id: contactId }, select: { orgId: true } });
      if (contactCheck && contactCheck.orgId !== account.orgId) {
        throw new Error(`[Security] Cross-tenant violation: Contact ${contactId} does not belong to Org ${account.orgId}`);
      }
    }

    const conversation = await findOrCreateConversation(db, msg, account.orgId, contactId, account.id);

    // Consistency Check 2: Ensure conversation belongs to the correct org
    const convCheck = await prisma.conversation.findUnique({ where: { id: conversation.id }, select: { orgId: true } });
    if (convCheck && convCheck.orgId !== account.orgId) {
      throw new Error(`[Security] Cross-tenant violation: Conversation ${conversation.id} does not belong to Org ${account.orgId}`);
    }

    const sentAt = new Date(msg.timestamp);
    const fingerprint = generateMessageFingerprint(msg.senderUid, msg.content || '', msg.timestamp);

    // Dedup guard using Fingerprint
    const existingFingerprint = await db.message.findUnique({
      where: { messageFingerprint: fingerprint },
      select: { id: true },
    });
    if (existingFingerprint) {
      logger.debug(`[message-handler] Skipping duplicate message via fingerprint: ${fingerprint}`);
      return null;
    }

    // Dedup guard for self messages (Legacy support)
    if (msg.isSelf && msg.msgId) {
      const recentDupe = await db.message.findFirst({
        where: {
          conversationId: conversation.id,
          senderType: 'self',
          content: msg.content || '',
          sentAt: { gte: new Date(Date.now() - 30_000) },
        },
        select: { id: true, zaloMsgId: true },
      });
      if (recentDupe) {
        // If the existing record has no zaloMsgId, backfill it for future dedup
        if (!recentDupe.zaloMsgId && msg.msgId) {
          await db.message.update({
            where: { id: recentDupe.id },
            data: { zaloMsgId: msg.msgId },
          }).catch(() => {});
        }
        logger.debug(`[message-handler] Skipping self echo: content match within 30s`);
        return null;
      }
    }

    // Deduplication logic
    let existing = null;
    if (msg.msgId) {
      existing = await db.message.findFirst({
        where: { zaloMsgId: msg.msgId },
      });
    }

    if (existing) {
      return { message: existing as any, conversationId: conversation.id, orgId: account.orgId, contactId };
    }

    const finalFingerprint = generateMessageFingerprint(msg.senderUid, msg.content || '', msg.timestamp);

    // Create new message
    let message;
    try {
      message = await db.message.create({
        data: {
          id: randomUUID(),
          orgId: account.orgId,
          conversationId: conversation.id,
          messageFingerprint: finalFingerprint,
          zaloMsgId: msg.msgId || `hydrated-${randomUUID()}`,
          senderType: msg.isSelf ? 'self' : 'customer',
          senderUid: msg.senderUid,
          senderName: msg.senderName || null,
          content: msg.content || '',
          contentType: msg.contentType || 'text',
          attachments: msg.attachments ?? [],
          quote: msg.quote ?? undefined,
          albumKey: msg.albumKey ?? null,
          albumIndex: msg.albumIndex ?? null,
          albumTotal: msg.albumTotal ?? null,
          sentAt,
        },
      });

    } catch (err: any) {
      // P2002 = unique constraint violation → duplicate zaloMsgId, skip silently
      if (err?.code === 'P2002') {
        logger.debug(`[message-handler] Skipping duplicate zaloMsgId=${msg.msgId}`);
        // Even if message is duplicate, ensure conversation timestamp is updated
        await updateConversationAfterMessage(db, conversation.id, sentAt, msg.isSelf);
        return null;
      }
      throw err;
    }

    await updateConversationAfterMessage(db, conversation.id, sentAt, msg.isSelf);

    // Track first outbound contact date — set once when agent sends first message
    if (msg.isSelf && contactId) {
      db.contact.updateMany({
        where: { id: contactId, firstContactDate: null },
        data: { firstContactDate: new Date(msg.timestamp) },
      }).catch(() => {});
    }

    // Skip webhooks and automation for backfilled messages (old_messages / sync)
    if (msg.isBackfill) {
      return {
        message,
        conversationId: conversation.id,
        orgId: account.orgId,
        contactId,
      };
    }

    // Emit webhook for message event (fire-and-forget)
    emitWebhook(account.orgId, msg.isSelf ? 'message.sent' : 'message.received', {
      messageId: message.id,
      conversationId: conversation.id,
      senderUid: msg.senderUid,
      content: msg.content,
      contentType: msg.contentType,
      sentAt: message.sentAt,
    });

    // Send Push Notifications to assigned users
    if (!msg.isSelf) {
      void (async () => {
        try {
          const { sendPushNotification } = await import('../notifications/push-service.js');
          
          // 1. Find all users with access to this Zalo account
          const access = await prisma.zaloAccountAccess.findMany({
            where: { zaloAccountId: msg.accountId },
            select: { userId: true }
          });
          
          // 2. Also include the owner
          const accountDetails = await prisma.zaloAccount.findUnique({
            where: { id: msg.accountId },
            select: { ownerUserId: true }
          });
          
          const userIds = new Set(access.map(a => a.userId));
          if (accountDetails?.ownerUserId) userIds.add(accountDetails.ownerUserId);
          
          // 3. Send notification to each user
          for (const userId of userIds) {
            await sendPushNotification(userId, account.orgId, {
              title: msg.senderName || 'Tin nhắn mới',
              body: msg.content?.substring(0, 100) || 'Bạn có tin nhắn mới từ Zalo',
              data: {
                conversationId: conversation.id,
                url: `/chat/${conversation.id}`
              }
            });
          }
        } catch (err) {
          logger.error('[push] Error in background push task:', err);
        }
      })();
    }

    // --- AUTO-REPLY FOR CALLS ---
    // User requested to stop the video call auto-reply feature.
    /*
    if (msg.contentType === 'call' && !msg.isSelf) {
      void (async () => {
        try {
          const { zaloPool } = await import('../zalo/zalo-pool.js');
          const instance = zaloPool.getInstance(msg.accountId);
          if (instance?.api) {
            const threadType = msg.threadType === 'group' ? 1 : 0;
            const autoReplyText = `Dạ hiện tại mình không tiện nghe máy trực tiếp trên này ạ. Phiền bạn nhấn vào link này để gọi video với mình qua Google Meet nha: https://meet.google.com/ads-up-crm \n\n(Hoặc bạn cứ để lại lời nhắn, mình sẽ phản hồi ngay nhé!)`;
            
            await instance.api.sendMessage(autoReplyText, msg.threadId, threadType);
            
            // Persist auto-reply to DB
            await prisma.message.create({
              data: {
                id: randomUUID(),
                orgId: account.orgId,
                conversationId: conversation.id,
                senderType: 'self',
                senderUid: '',
                senderName: 'AI Auto-Reply',
                content: autoReplyText,
                contentType: 'text',
                sentAt: new Date(),
              }
            });
            
            await prisma.conversation.update({
              where: { id: conversation.id },
              data: { isReplied: true, unreadCount: 0, lastMessageAt: new Date() }
            });
          }
        } catch (err) {
          logger.error('[message-handler] Auto-reply call error:', err);
        }
      })();
    }
    */
    // ----------------------------


    if (!msg.isSelf) {
      const org = await db.organization.findUnique({
        where: { id: account.orgId },
        select: { id: true, name: true },
      });
      const contact = contactId
        ? await db.contact.findUnique({
            where: { id: contactId },
            select: { id: true, fullName: true, crmName: true, phone: true, status: true, source: true, assignedUserId: true },
          })
        : null;
      const conversationDetails = await db.conversation.findUnique({
        where: { id: conversation.id },
        select: { id: true, unreadCount: true, externalThreadId: true, threadType: true, zaloAccountId: true },
      });

      void runAutomationRules({
        trigger: 'message_received',
        orgId: account.orgId,
        org,
        contact,
        conversation: conversationDetails
          ? {
              id: conversationDetails.id,
              unreadCount: conversationDetails.unreadCount,
              threadId: conversationDetails.externalThreadId,
              threadType: conversationDetails.threadType,
              zaloAccountId: conversationDetails.zaloAccountId,
            }
          : null,
        message: { id: message.id, content: message.content, contentType: message.contentType, senderType: message.senderType },
      });
    }

    return {
      message,
      conversationId: conversation.id,
      orgId: account.orgId,
      contactId,
    };
  } catch (err) {
    logger.error('[message-handler] handleIncomingMessage error:', err);
    return null;
  }
}

// Upsert contact — handles both user and group conversations
async function upsertContact(db: any, msg: IncomingMessage, orgId: string): Promise<string | null> {
  // Group messages: create/update a "contact" record representing the group
  if (msg.threadType === 'group') {
    const groupUid = msg.threadId;
    let groupContact = await db.contact.findFirst({
      where: { zaloUid: groupUid },
      select: { id: true, fullName: true },
    });

    if (!groupContact) {
      groupContact = await db.contact.create({
        data: {
          id: randomUUID(),
          zaloUid: groupUid,
          fullName: msg.groupName || 'Nhóm',
          metadata: { isGroup: true },
        },
        select: { id: true, fullName: true },
      });
      // Emit webhook for new contact created
      emitWebhook(orgId, 'contact.created', { contactId: groupContact.id, fullName: groupContact.fullName });
    } else if (msg.groupName && groupContact.fullName !== msg.groupName) {
      await db.contact.update({
        where: { id: groupContact.id },
        data: { fullName: msg.groupName },
      });
    }
    return groupContact.id;
  }

  // For self messages on user threads, the contact is the thread recipient (threadId = contact UID)
  const contactUid = msg.isSelf ? msg.threadId : msg.senderUid;
  const contactName = msg.isSelf ? '' : msg.senderName; // self msgs don't carry recipient name

  let contact = await db.contact.findFirst({
    where: { zaloUid: contactUid },
    select: { id: true, fullName: true },
  });

  if (!contact) {
    contact = await db.contact.create({
      data: {
        id: randomUUID(),
        zaloUid: contactUid,
        fullName: contactName || 'Unknown',
      },
      select: { id: true, fullName: true },
    });
    // Emit webhook for new contact created
    emitWebhook(orgId, 'contact.created', { contactId: contact.id, fullName: contact.fullName });
  } else if (contactName && contact.fullName !== contactName && contact.fullName === 'Unknown') {
    // Update name only if currently "Unknown" — don't overwrite user-edited names
    await db.contact.update({
      where: { id: contact.id },
      data: { fullName: contactName },
    });
  }

  return contact.id;
}

// Find or create conversation — externalThreadId = threadId for both user and group
async function findOrCreateConversation(
  db: any,
  msg: IncomingMessage,
  orgId: string,
  contactId: string | null,
  accountId: string, // NHẬN THÊM ACCOUNT ID TỪ BÊN NGOÀI
) {
  const externalThreadId = msg.threadId;

  const existing = await db.conversation.findFirst({
    where: { orgId, zaloAccountId: accountId, externalThreadId }, // THÊM orgId VÀ DÙNG accountId CHUẨN
    select: { id: true },
  });

  if (existing) return existing;

  return db.conversation.create({
    data: {
      id: randomUUID(),
      orgId, // THÊM orgId VÀO ĐÂY
      zaloAccountId: accountId, // DÙNG accountId CHUẨN
      contactId: contactId,
      threadType: msg.threadType || 'personal',
      externalThreadId,
      lastMessageAt: new Date(msg.timestamp),
      unreadCount: msg.isSelf ? 0 : 1,
      isReplied: msg.isSelf,
    },
    select: { id: true },
  });
}

// Update conversation metadata after a new message
async function updateConversationAfterMessage(
  db: any,
  conversationId: string,
  sentAt: Date,
  isSelf: boolean,
): Promise<void> {
  const updateData: any = { lastMessageAt: sentAt };
  if (isSelf) {
    updateData.isReplied = true;
    updateData.unreadCount = 0;
  } else {
    updateData.unreadCount = { increment: 1 };
    updateData.isReplied = false;
  }
  await db.conversation.update({ where: { id: conversationId }, data: updateData });
}

// Soft-delete a message by its Zalo message ID
export async function handleMessageUndo(accountId: string, zaloMsgId: string): Promise<void> {
  try {
    // Need orgId for safe update
    const account = await prisma.zaloAccount.findUnique({
      where: { id: accountId },
      select: { orgId: true },
    });
    if (!account) return;
    const db = getTenantPrisma(account.orgId);
    
    await db.message.updateMany({
      where: { zaloMsgId: String(zaloMsgId) },
      data: { isDeleted: true, deletedAt: new Date() },
    });
    logger.info(`[message-handler] Undo message ${zaloMsgId} for account ${accountId}`);
  } catch (err) {
    logger.error('[message-handler] handleMessageUndo error:', err);
  }
}
