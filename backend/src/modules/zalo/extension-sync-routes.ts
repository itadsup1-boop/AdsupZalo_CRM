/**
 * extension-sync-routes.ts
 * API endpoint to receive messages pushed from Chrome Extension
 */
import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../auth/auth-middleware.js';
import { getTenantPrisma } from '../../shared/database/prisma-tenant.js';
import { logger } from '../../shared/utils/logger.js';
import { handleIncomingMessage } from '../chat/message-handler.js';

export async function extensionSyncRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);

  /**
   * POST /api/v1/zalo/extension-sync
   * Receives a batch of messages from the Chrome Extension
   * The extension reads IndexedDB from chat.zalo.me and sends them here
   */
  app.post('/api/v1/zalo/extension-sync', async (request, reply) => {
    const user = request.user!;
    const body = request.body as {
      messages: Array<{
        msgId: string;
        content: string;
        senderId: string;
        senderName?: string;
        threadId: string;
        timestamp: number;
        isSelf: boolean;
        msgType: number;
      }>;
      accountId?: string;
    };

    if (!body.messages || !Array.isArray(body.messages)) {
      return reply.status(400).send({ error: 'messages array required' });
    }

    const db = getTenantPrisma(user.orgId);
    const bodyWithOptional = body as any;
    const zaloUid = bodyWithOptional.zaloUid;

    // Tìm tài khoản Zalo khớp chính xác
    let account = null;
    const rawZaloName = bodyWithOptional.zaloName || '';
    const cleanZaloName = rawZaloName.replace('Zalo - ', '').trim();
    
    // 1. Ưu tiên tìm theo zaloUid (Chuẩn nhất)
    if (zaloUid) {
      account = await db.zaloAccount.findFirst({ where: { orgId: user.orgId, zaloUid: zaloUid } });
    }

    // 2. Nếu không thấy UID, tìm theo tên và cập nhật UID luôn
    if (!account && cleanZaloName) {
      account = await db.zaloAccount.findFirst({ 
        where: { 
          orgId: user.orgId, 
          displayName: { contains: cleanZaloName, mode: 'insensitive' } 
        } 
      });
      
      // Ghi nhớ UID này cho nick này
      if (account && zaloUid && !account.zaloUid) {
        await db.zaloAccount.update({
          where: { id: account.id },
          data: { zaloUid: zaloUid }
        });
        logger.info(`[ext-sync] Assigned UID ${zaloUid} to account ${account.displayName}`);
      }
    }

    return { success: true, saved: savedCount, skipped: skippedCount };
  });

  /**
   * POST /api/v1/zalo/heartbeat
   * Reports the online status of an account from the extension
   */
  app.post('/api/v1/zalo/heartbeat', async (request, reply) => {
    const user = request.user!;
    const body = request.body as { 
      tabId: number;
      title: string; 
      accountId?: string;
    };

    const db = getTenantPrisma(user.orgId);
    
    // Attempt to identify the Zalo account by title or explicit ID
    // Zalo Web title usually contains the name: "Zalo - [Tên người dùng]"
    const account = await db.zaloAccount.findFirst({
      where: { orgId: user.orgId } // In Phase 1, we match first available or use explicit ID
    });

    if (account) {
      await db.zaloAccount.update({
        where: { id: account.id },
        data: {
          lastSeen: new Date(),
          status: 'connected',
          browserNodeId: `tab-${body.tabId}`
        }
      });
    }

    return { success: true };
  });
}
