import cron from 'node-cron';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { zaloPool } from './zalo-pool.js';
import { logAiActivity } from '../ai/ai-audit-service.js';

function nextBackoffMinutes(retryCount: number) {
  return Math.min(60, Math.pow(2, Math.max(1, retryCount)) * 5);
}

export function startZaloSendRetryWorker() {
  cron.schedule('*/5 * * * *', async () => {
    const due = await prisma.message.findMany({
      where: {
        deliveryStatus: 'retrying',
        nextRetryAt: { lte: new Date() },
        retryCount: { lt: 5 },
      },
      include: {
        conversation: { select: { orgId: true, zaloAccountId: true, externalThreadId: true, threadType: true, contactId: true, teamId: true } },
      },
      take: 50,
      orderBy: { nextRetryAt: 'asc' },
    });

    for (const message of due) {
      try {
        const conversation = message.conversation;
        if (!conversation.zaloAccountId || !conversation.externalThreadId) throw new Error('Missing Zalo thread for retry');
        const instance = zaloPool.getInstance(conversation.zaloAccountId);
        if (!instance?.api) throw new Error('Zalo account not connected');
        const threadType = conversation.threadType === 'group' ? 1 : 0;
        const result = await instance.api.sendMessage({ msg: message.content || '' }, conversation.externalThreadId, threadType);
        const zaloMsgId = String(result?.msgId || result?.data?.msgId || '');
        await prisma.message.update({
          where: { id: message.id },
          data: { deliveryStatus: 'sent', zaloMsgId: zaloMsgId || message.zaloMsgId, lastSendError: null, nextRetryAt: null },
        });
        logger.info(`[zalo-retry] Sent retry message ${message.id}`);
      } catch (err) {
        const retryCount = message.retryCount + 1;
        const failed = retryCount >= 5;
        await prisma.message.update({
          where: { id: message.id },
          data: {
            deliveryStatus: failed ? 'failed' : 'retrying',
            retryCount,
            lastSendError: err instanceof Error ? err.message : String(err),
            nextRetryAt: failed ? null : new Date(Date.now() + nextBackoffMinutes(retryCount) * 60 * 1000),
          },
        });
        await logAiActivity({
          orgId: message.orgId,
          teamId: message.conversation.teamId,
          contactId: message.conversation.contactId,
          conversationId: message.conversationId,
          messageId: message.id,
          actorType: 'system',
          actionType: failed ? 'zalo.send_failed_final' : 'zalo.send_retry_failed',
          inputMessage: message.content,
          confidence: 0,
          review: failed ? {
            issueType: 'send_failed',
            severity: 'critical',
            reason: err instanceof Error ? err.message : String(err),
            aiResponse: message.content,
          } : undefined,
        });
      }
    }
  }, { timezone: 'Asia/Ho_Chi_Minh' });
  logger.info('[zalo-retry] Send retry worker started');
}
