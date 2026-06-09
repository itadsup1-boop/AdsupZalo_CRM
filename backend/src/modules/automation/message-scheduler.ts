import { prisma } from '../../shared/database/prisma-client.js';
import { getTenantPrisma } from '../../shared/database/prisma-tenant.js';
import { logger } from '../../shared/utils/logger.js';
import { zaloPool } from '../zalo/zalo-pool.js';
import { zaloRateLimiter } from '../zalo/zalo-rate-limiter.js';
import { randomUUID } from 'node:crypto';

let intervalId: ReturnType<typeof setInterval> | null = null;

export function startMessageScheduler() {
  if (intervalId) return;

  logger.info('[scheduler] Message automation scheduler started');
  intervalId = setInterval(async () => {
    try {
      await processScheduledMessages();
    } catch (error) {
      logger.error('[scheduler] Error in message scheduler loop:', error);
    }
  }, 10000); // Check every 10 seconds
}

export function stopMessageScheduler() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    logger.info('[scheduler] Message automation scheduler stopped');
  }
}

async function processScheduledMessages() {
  const now = new Date();
  
  // Find pending scheduled messages due to send
  const messages = await prisma.scheduledMessage.findMany({
    where: {
      status: 'pending',
      scheduledAt: { lte: now },
    },
    include: {
      contact: true,
    },
    take: 20, // Process in small batches
  });

  for (const msg of messages) {
    const db = getTenantPrisma(msg.orgId);
    try {
      if (!msg.contact?.zaloUid) {
        await prisma.scheduledMessage.update({
          where: { id: msg.id },
          data: { status: 'failed', errorReason: 'Contact does not have Zalo UID' },
        });
        continue;
      }

      // Determine Zalo Account to use
      let zaloAccountId = msg.zaloAccountId;
      if (!zaloAccountId) {
        // Find from existing conversation
        const conv = await db.conversation.findFirst({
          where: { contactId: msg.contactId },
          select: { zaloAccountId: true },
        });
        if (conv) {
          zaloAccountId = conv.zaloAccountId;
        } else {
          // Fallback to first available account in organization
          const fallbackAcc = await prisma.zaloAccount.findFirst({
            where: { orgId: msg.orgId },
            select: { id: true },
          });
          zaloAccountId = fallbackAcc?.id || null;
        }
      }

      if (!zaloAccountId) {
        await prisma.scheduledMessage.update({
          where: { id: msg.id },
          data: { status: 'failed', errorReason: 'No Zalo account associated or found for this contact' },
        });
        continue;
      }

      // Get Zalo client instance
      const instance = zaloPool.getInstance(zaloAccountId);
      if (!instance?.api) {
        // Leave pending to retry later when connected, or log warning
        logger.warn(`[scheduler] Zalo account ${zaloAccountId} not connected/loaded for scheduled message ${msg.id}`);
        continue;
      }

      // Rate limit check
      const limits = await zaloRateLimiter.checkLimits(zaloAccountId);
      if (!limits.allowed) {
        logger.warn(`[scheduler] Zalo account ${zaloAccountId} hit rate limit, postponing scheduled message ${msg.id}`);
        continue;
      }

      // Record sending and call API
      zaloRateLimiter.recordSend(zaloAccountId);
      
      const personalizedContent = msg.content
        .replace(/\{\{name\}\}/g, msg.contact.crmName || msg.contact.fullName || 'Khách hàng')
        .replace(/\{\{phone\}\}/g, msg.contact.phone || '');

      logger.info(`[scheduler] Sending scheduled message to contact ${msg.contact.fullName} (UID: ${msg.contact.zaloUid})`);
      const sendResult = await instance.api.sendMessage({ msg: personalizedContent }, msg.contact.zaloUid, 0);
      const zaloMsgId = String(sendResult?.msgId || sendResult?.data?.msgId || '');

      // Create conversation if it doesn't exist
      let conversation = await db.conversation.findFirst({
        where: { zaloAccountId, contactId: msg.contactId },
      });
      if (!conversation) {
        conversation = await db.conversation.create({
          data: {
            id: randomUUID(),
            orgId: msg.orgId,
            zaloAccountId,
            contactId: msg.contactId,
            threadType: 'personal',
            externalThreadId: msg.contact.zaloUid,
            lastMessageAt: new Date(),
            unreadCount: 0,
            isReplied: true,
          },
        });
      }

      // Save Message record
      await db.message.create({
        data: {
          id: randomUUID(),
          orgId: msg.orgId,
          conversationId: conversation.id,
          zaloMsgId: zaloMsgId || `sch-${randomUUID()}`,
          senderType: 'self',
          senderUid: '',
          senderName: 'Automation',
          content: personalizedContent,
          contentType: 'text',
          sentAt: new Date(),
        },
      });

      // Update conversation
      await db.conversation.update({
        where: { id: conversation.id },
        data: {
          lastMessageAt: new Date(),
          isReplied: true,
          unreadCount: 0,
        },
      });

      // Mark scheduled message as sent
      await prisma.scheduledMessage.update({
        where: { id: msg.id },
        data: { status: 'sent', sentAt: new Date() },
      });

    } catch (err: any) {
      logger.error(`[scheduler] Failed to send scheduled message ${msg.id}:`, err);
      await prisma.scheduledMessage.update({
        where: { id: msg.id },
        data: { status: 'failed', errorReason: err.message || String(err) },
      });
    }
  }
}
