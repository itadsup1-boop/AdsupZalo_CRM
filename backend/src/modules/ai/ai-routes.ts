import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authMiddleware } from '../auth/auth-middleware.js';
import { requireRole } from '../auth/role-middleware.js';
import { requireZaloAccess } from '../zalo/zalo-access-middleware.js';
import { getAiConfig, getAiUsage, updateAiConfig, generateAiOutput } from './ai-service.js';
import { getAvailableProviders } from './provider-registry.js';
import { logger } from '../../shared/utils/logger.js';
import { prisma } from '../../shared/database/prisma-client.js';
import { processAiBookingMessage } from '../appointments/ai-booking-flow-service.js';
import { requirePermission } from '../../shared/auth/require-permission.js';
import { randomUUID } from 'node:crypto';

async function assertConversationReadAccess(request: FastifyRequest, reply: FastifyReply, conversationId: string) {
  const user = request.user!;
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, orgId: user.orgId },
    select: { id: true, zaloAccountId: true },
  });
  if (!conversation) {
    reply.status(404).send({ error: 'Conversation not found' });
    return null;
  }
  if (['owner', 'admin', 'member'].includes(user.role)) return conversation;
  if (!conversation.zaloAccountId) {
    reply.status(403).send({ error: 'Không có tài khoản Zalo để kiểm tra quyền truy cập' });
    return null;
  }

  const access = await prisma.zaloAccountAccess.findFirst({
    where: { zaloAccountId: conversation.zaloAccountId, userId: user.id },
    select: { permission: true },
  });
  if (!access) {
    reply.status(403).send({ error: 'Không có quyền truy cập tài khoản Zalo này' });
    return null;
  }
  return conversation;
}

function getStatusFromError(err: unknown, fallback: string) {
  const message = err instanceof Error ? err.message : fallback;
  const status = message.includes('quota exceeded') ? 429 : message.includes('not found') ? 404 : message.includes('disabled') || message.includes('configured') ? 400 : 500;
  return { message, status };
}

function sendHandledError(reply: FastifyReply, err: unknown, fallback: string) {
  const handled = getStatusFromError(err, fallback);
  const safeMessage = handled.status === 500 ? fallback : handled.message;
  return reply.status(handled.status).send({ error: safeMessage });
}


export async function aiRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);

  /* Returns available AI providers + their models (based on .env config) */
  app.get('/api/v1/ai/providers', async () => {
    return getAvailableProviders();
  });

  app.get('/api/v1/ai/config', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      return await getAiConfig(request.user!.orgId);
    } catch (err) {
      logger.error('[ai] Get config error:', err);
      return reply.status(500).send({ error: 'Failed to fetch AI config' });
    }
  });

  app.put('/api/v1/ai/config', { preHandler: requireRole('owner', 'admin') }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as { 
        provider?: string; 
        model?: string; 
        maxDaily?: number; 
        enabled?: boolean; 
        autoReplyEnabled?: boolean;
        intentClassificationEnabled?: boolean;
        systemPrompt?: string;
      };
      if (body.maxDaily !== undefined && body.maxDaily < 1) return reply.status(400).send({ error: 'maxDaily must be at least 1' });
      return await updateAiConfig(request.user!.orgId, body);
    } catch (err) {
      logger.error('[ai] Update config error:', err);
      return reply.status(500).send({ error: 'Failed to update AI config' });
    }
  });

  app.get('/api/v1/ai/usage', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      return await getAiUsage(request.user!.orgId);
    } catch (err) {
      logger.error('[ai] Usage error:', err);
      return reply.status(500).send({ error: 'Failed to fetch AI usage' });
    }
  });

  app.get('/api/v1/ai/prompt-versions', { preHandler: requirePermission('ai:config') }, async (request: FastifyRequest) => {
    const versions = await prisma.aiPromptVersion.findMany({
      where: { orgId: request.user!.orgId },
      orderBy: [{ promptType: 'asc' }, { version: 'desc' }],
      take: 100,
    });
    return { versions };
  });

  app.post('/api/v1/ai/prompt-versions/:id/rollback', { preHandler: requirePermission('ai:config') }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const version = await prisma.aiPromptVersion.findFirst({ where: { orgId: user.orgId, id } });
    if (!version) return reply.status(404).send({ error: 'Prompt version not found' });
    await prisma.$transaction([
      prisma.aiPromptVersion.updateMany({ where: { orgId: user.orgId, promptType: version.promptType, isActive: true }, data: { isActive: false } }),
      prisma.aiPromptVersion.update({ where: { id: version.id }, data: { isActive: true } }),
      prisma.appSetting.upsert({
        where: { orgId_settingKey: { orgId: user.orgId, settingKey: 'ai_system_prompt' } },
        update: { valuePlain: version.content },
        create: { orgId: user.orgId, settingKey: 'ai_system_prompt', valuePlain: version.content },
      }),
      prisma.activityLog.create({
        data: {
          orgId: user.orgId,
          userId: user.id,
          action: 'ai.prompt.rollback',
          entityType: 'ai_prompt_version',
          entityId: version.id,
          details: { promptType: version.promptType, version: version.version },
        },
      }),
    ]);
    return { success: true };
  });

  app.post('/api/v1/ai/suggest', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as { conversationId?: string; messageId?: string };
      if (!body.conversationId) return reply.status(400).send({ error: 'conversationId is required' });
      const access = await assertConversationReadAccess(request, reply, body.conversationId);
      if (!access) return;
      return await generateAiOutput({ orgId: request.user!.orgId, conversationId: body.conversationId, messageId: body.messageId, type: 'reply_draft' });
    } catch (err) {
      logger.error('[ai] Suggest error:', err);
      return sendHandledError(reply, err, 'Failed to generate AI suggestion');
    }
  });

  app.post('/api/v1/ai/booking-flow', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const body = request.body as { conversationId?: string; text?: string; source?: string };
      if (!body.conversationId) return reply.status(400).send({ error: 'conversationId is required' });
      if (!body.text) return reply.status(400).send({ error: 'text is required' });
      const conversation = await assertConversationReadAccess(request, reply, body.conversationId);
      if (!conversation) return;
      const fullConversation = await prisma.conversation.findFirst({
        where: { id: body.conversationId, orgId: user.orgId },
        select: { contactId: true, contact: { select: { assignedUserId: true } } },
      });
      return await processAiBookingMessage({
        orgId: user.orgId,
        conversationId: body.conversationId,
        contactId: fullConversation?.contactId,
        assignedUserId: fullConversation?.contact?.assignedUserId || user.id,
        text: body.text,
        source: body.source || 'zalo',
      });
    } catch (err) {
      logger.error('[ai] Booking flow error:', err);
      return sendHandledError(reply, err, 'Failed to process booking flow');
    }
  });

  app.post('/api/v1/ai/summarize/:id', { preHandler: requireZaloAccess('read') }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      return await generateAiOutput({ orgId: request.user!.orgId, conversationId: id, type: 'summary' });
    } catch (err) {
      logger.error('[ai] Summary error:', err);
      return sendHandledError(reply, err, 'Failed to summarize conversation');
    }
  });

  app.post('/api/v1/ai/sentiment/:id', { preHandler: requireZaloAccess('read') }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      return await generateAiOutput({ orgId: request.user!.orgId, conversationId: id, type: 'sentiment' });
    } catch (err) {
      logger.error('[ai] Sentiment error:', err);
      return sendHandledError(reply, err, 'Failed to analyze sentiment');
    }
  });

  // ==========================
  // AI Knowledge Base API
  // ==========================

  app.get('/api/v1/ai/knowledge', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const items = await prisma.aiKnowledge.findMany({
        where: { orgId: request.user!.orgId },
        orderBy: { createdAt: 'desc' }
      });
      return { data: items };
    } catch (err) {
      logger.error('[ai] Get knowledge items error:', err);
      return reply.status(500).send({ error: 'Failed to fetch AI knowledge items' });
    }
  });

  app.post('/api/v1/ai/knowledge', { preHandler: requireRole('owner', 'admin') }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { category, title, content, isActive } = request.body as {
        category: string;
        title: string;
        content: string;
        isActive?: boolean;
      };

      if (!category) return reply.status(400).send({ error: 'Category is required' });
      if (!title) return reply.status(400).send({ error: 'Title is required' });
      if (!content) return reply.status(400).send({ error: 'Content is required' });

      const item = await prisma.aiKnowledge.create({
        data: {
          id: randomUUID(),
          orgId: request.user!.orgId,
          category,
          title,
          content,
          isActive: isActive !== undefined ? isActive : true,
          updatedAt: new Date(),
        }
      });
      return { data: item };
    } catch (err) {
      logger.error('[ai] Create knowledge item error:', err);
      return reply.status(500).send({ error: 'Failed to create AI knowledge item' });
    }
  });

  app.put('/api/v1/ai/knowledge/:id', { preHandler: requireRole('owner', 'admin') }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const { category, title, content, isActive } = request.body as {
        category?: string;
        title?: string;
        content?: string;
        isActive?: boolean;
      };

      // Ensure item belongs to the organization
      const existing = await prisma.aiKnowledge.findFirst({
        where: { orgId: request.user!.orgId, id }
      });
      if (!existing) {
        return reply.status(404).send({ error: 'AI knowledge item not found' });
      }

      const item = await prisma.aiKnowledge.update({
        where: { orgId_id: { orgId: request.user!.orgId, id } },
        data: {
          category,
          title,
          content,
          isActive,
          updatedAt: new Date(),
        }
      });
      return { data: item };
    } catch (err) {
      logger.error('[ai] Update knowledge item error:', err);
      return reply.status(500).send({ error: 'Failed to update AI knowledge item' });
    }
  });

  app.delete('/api/v1/ai/knowledge/:id', { preHandler: requireRole('owner', 'admin') }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };

      // Ensure item belongs to the organization
      const existing = await prisma.aiKnowledge.findFirst({
        where: { orgId: request.user!.orgId, id }
      });
      if (!existing) {
        return reply.status(404).send({ error: 'AI knowledge item not found' });
      }

      await prisma.aiKnowledge.delete({
        where: { orgId_id: { orgId: request.user!.orgId, id } }
      });
      return { success: true };
    } catch (err) {
      logger.error('[ai] Delete knowledge item error:', err);
      return reply.status(500).send({ error: 'Failed to delete AI knowledge item' });
    }
  });
}
