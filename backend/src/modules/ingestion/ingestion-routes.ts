import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../auth/auth-middleware.js';
import { getTenantPrisma } from '../../shared/database/prisma-tenant.js';
import { logger } from '../../shared/utils/logger.js';
import { handleIncomingMessage } from '../chat/message-handler.js';

export async function ingestionRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);

  /**
   * POST /api/v1/ingestion/sync
   * Receives messages from Extension.
   */
  app.post('/api/v1/ingestion/sync', async (request, reply) => {
    const user = request.user!;
    const body = request.body as any;

    if (!body.messages || !Array.isArray(body.messages)) {
      return reply.status(400).send({ error: 'messages array required' });
    }
    const db = getTenantPrisma(user.orgId);
    let account = null;

    // 1. Ưu tiên tìm theo ID cụ thể hoặc Zalo UID
    if (body.accountId) {
      account = await db.zaloAccount.findUnique({ where: { id: body.accountId } });
    } else if (body.zaloUid) {
      account = await db.zaloAccount.findFirst({ where: { orgId: user.orgId, zaloUid: body.zaloUid } });
    } else if (body.zaloName) {
      const cleanName = body.zaloName.replace('Zalo - ', '').trim();
      account = await db.zaloAccount.findFirst({ 
        where: { orgId: user.orgId, displayName: { contains: cleanName, mode: 'insensitive' } } 
      });
    }

    if (!account) {
      logger.warn(`[ingestion] No account found for ${JSON.stringify(body)}. Falling back to first active.`);
      account = await db.zaloAccount.findFirst({ where: { orgId: user.orgId, status: 'active' } });
    }

    if (!account) {
      logger.error(`[ingestion] NO ACTIVE ACCOUNT FOUND for org ${user.orgId}`);
      return reply.status(404).send({ error: 'No active Zalo account' });
    }

    logger.info(`[ingestion] Mapping to account: ${account.displayName} (${account.id})`);

    // Log the sync event
    await db.systemLog.create({
      data: {
        source: 'ingestion',
        level: 'info',
        event: 'batch_sync',
        payload: { accountId: account.id, count: body.messages.length }
      }
    }).catch(() => {});

    let saved = 0;
    for (const msg of body.messages) {
      try {
        const result = await handleIncomingMessage({
          accountId: account.id,
          senderUid: String(msg.senderId || ''),
          senderName: msg.senderName || 'Unknown',
          content: msg.content,
          contentType: msg.msgType === 2 ? 'image' : 'text',
          msgId: msg.msgId,
          timestamp: msg.timestamp || Date.now(),
          isSelf: msg.isSelf || false,
          threadId: msg.threadId,
          threadType: 'user',
          isBackfill: true,
        });
        if (result) saved++;
      } catch (e) {}
    }

    return { success: true, saved };
  });

  /**
   * POST /api/v1/ingestion/heartbeat
   */
  app.post('/api/v1/ingestion/heartbeat', async (request, reply) => {
    const user = request.user!;
    const body = request.body as any;
    const db = getTenantPrisma(user.orgId);

    const account = await db.zaloAccount.findFirst({ where: { orgId: user.orgId } });
    if (account) {
      await db.zaloAccount.update({
        where: { id: account.id },
        data: {
          lastSeen: new Date(),
          status: 'active',
          browserNodeId: body.browserNodeId || 'unknown'
        }
      });
    }

    return { success: true };
  });
}
