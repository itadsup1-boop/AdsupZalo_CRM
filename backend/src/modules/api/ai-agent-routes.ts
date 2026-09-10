import type { FastifyInstance } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { sendConversationText } from '../appointments/customer-message-service.js';

export async function aiAgentRoutes(app: FastifyInstance) {
  /**
   * POST /api/v1/ai-agent/callback
   * AI Python API callback for sending messages to Zalo
   */
  app.post('/callback', async (request, reply) => {
    try {
      const body = request.body as any;
      const {
        event,
        org_id,
        account_id,
        conversation_id,
        contact_id,
        zalo_uid,
        reply: replyText,
        reply_type,
        source_message_ids
      } = body;

      if (event !== 'ai_reply' || !replyText || !conversation_id) {
        return reply.status(400).send({ error: 'Invalid payload' });
      }

      // 1. Kiểm tra conversation tồn tại.
      const conversation = await prisma.conversation.findUnique({
        where: { id: conversation_id }
      });

      if (!conversation) {
        logger.warn(`[ai-agent] Conversation ${conversation_id} not found`);
        return reply.status(404).send({ error: 'Conversation not found' });
      }

      // 2. Kiểm tra aiPaused.
      if (conversation.aiPaused) {
        logger.info(`[ai-agent] Skipped AI reply for conversation ${conversation_id} because aiPaused = true`);
        return reply.status(200).send({ status: 'skipped', reason: 'aiPaused is true' });
      }

      // 3. Kiểm tra nhân viên có vừa trả lời sau tin khách không.
      // (Bản chất isHumanSelf = true đã set aiPaused = true, nên bước 2 đã cover, nhưng ta check thêm cho chắc chắn)
      if (conversation.lastStaffMessageAt && conversation.lastMessageAt && conversation.lastStaffMessageAt > conversation.lastMessageAt) {
        logger.info(`[ai-agent] Skipped AI reply because staff replied recently.`);
        return reply.status(200).send({ status: 'skipped', reason: 'staff_replied' });
      }

      // 4. Chống gửi trùng reply_id.
      const reply_id = body.reply_id;
      if (reply_id) {
        const duplicateLog = await prisma.aiActivityLog.findFirst({
          where: { actorId: reply_id, actionType: 'ai_reply_sent' }
        });
        if (duplicateLog) {
          logger.info(`[ai-agent] Skipped duplicate AI reply_id: ${reply_id}`);
          return reply.status(200).send({ status: 'skipped', reason: 'duplicate_reply_id' });
        }
      }

      // 5. Gửi reply ra Zalo bằng hàm sendConversationText.
      logger.info(`[ai-agent] Sending AI reply to conversation ${conversation_id}`);
      
      await sendConversationText({
        orgId: org_id || conversation.orgId,
        conversationId: conversation.id,
        content: replyText,
        senderName: 'AI Assistant',
      });

      // Update timestamps
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          lastStaffMessageAt: new Date(),
          isReplied: true,
        }
      });

      // 6. Lưu log AI reply.
      if (reply_id) {
        const { randomUUID } = await import('node:crypto');
        await prisma.aiActivityLog.create({
          data: {
            id: randomUUID(),
            orgId: conversation.orgId,
            conversationId: conversation.id,
            contactId: conversation.contactId,
            actorType: 'python_ai',
            actorId: reply_id,
            actionType: 'ai_reply_sent',
            outputMessage: replyText,
            createdAt: new Date(),
          }
        });
      }

      return { success: true };
    } catch (err: any) {
      logger.error('[ai-agent] Callback processing failed:', err.message);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });
}
