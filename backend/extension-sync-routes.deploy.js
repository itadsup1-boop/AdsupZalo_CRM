import { getTenantPrisma } from '../../shared/database/prisma-tenant.js';
import { logger } from '../../shared/utils/logger.js';
import { handleIncomingMessage } from '../chat/message-handler.js';
import { authMiddleware } from '../auth/auth-middleware.js';

export async function extensionSyncRoutes(app) {
  app.addHook('preHandler', authMiddleware);

  app.post('/api/v1/zalo/extension-sync', async (request, reply) => {
    const user = request.user;
    if (!user) return reply.status(401).send({ error: 'Unauthorized' });

    const body = request.body;
    if (!body.messages || !Array.isArray(body.messages)) {
      return reply.status(400).send({ error: 'messages array required' });
    }

    const db = getTenantPrisma(user.orgId);
    const account = body.accountId
      ? await db.zaloAccount.findFirst({ where: { id: body.accountId, orgId: user.orgId } })
      : await db.zaloAccount.findFirst({ where: { orgId: user.orgId } });

    if (!account) return reply.status(404).send({ error: 'No connected Zalo account found' });

    logger.info(`[ext-sync] Received ${body.messages.length} messages for account ${account.id}`);
    let savedCount = 0, skippedCount = 0;
    const errors = [];

    for (const msg of body.messages) {
      if (!msg.msgId || !msg.threadId) { skippedCount++; continue; }
      try {
        await handleIncomingMessage({
          accountId: account.id,
          senderUid: String(msg.senderId || ''),
          senderName: msg.senderName || String(msg.senderId || 'Unknown'),
          content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content || ''),
          contentType: msg.msgType === 2 ? 'image' : 'text',
          msgId: msg.msgId,
          timestamp: msg.timestamp || Date.now(),
          isSelf: msg.isSelf || false,
          threadId: msg.threadId,
          threadType: 'user',
          isBackfill: true,
        });
        savedCount++;
      } catch (err) {
        if (!err.message?.includes('Unique constraint')) errors.push(`${msg.msgId}: ${err.message}`);
        else skippedCount++;
      }
    }

    logger.info(`[ext-sync] Saved: ${savedCount}, Skipped: ${skippedCount}`);
    return { success: true, saved: savedCount, skipped: skippedCount, errors: errors.slice(0, 10) };
  });
}
