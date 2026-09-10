import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { requirePermission } from '../../shared/auth/require-permission.js';
import { getContactAccessWhere, getConversationAccessWhere } from '../../shared/utils/permission-scope.js';

type QueryParams = Record<string, string>;

function scopedTeamFilter(user: any, requestedTeamId?: string) {
  if (['owner', 'admin'].includes(user.role)) return requestedTeamId || undefined;
  return user.teamId || '__no_team__';
}

export async function aiAuditRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);

  app.get('/api/v1/ai/activity-logs', { preHandler: requirePermission('ai:audit:read') }, async (request: FastifyRequest) => {
    const user = request.user!;
    const {
      page = '1', limit = '50', contactId, conversationId, actionType, teamId, assignedUserId, dateFrom, dateTo,
    } = request.query as QueryParams;
    const pageNum = Math.max(parseInt(page, 10), 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10), 1), 200);
    const where: any = { orgId: user.orgId };
    const scopedTeam = scopedTeamFilter(user, teamId);
    if (scopedTeam) where.teamId = scopedTeam;
    if (contactId) where.contactId = contactId;
    if (conversationId) where.conversationId = conversationId;
    if (actionType) where.actionType = actionType;
    if (assignedUserId) where.assignedUserId = assignedUserId;
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.createdAt.lte = new Date(dateTo);
    }

    const [logs, total] = await Promise.all([
      prisma.aiActivityLog.findMany({
        where,
        include: {
          contact: { select: { id: true, fullName: true, crmName: true, phone: true } },
          actor: { select: { id: true, fullName: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      }),
      prisma.aiActivityLog.count({ where }),
    ]);
    return { logs, total, page: pageNum, limit: limitNum };
  });

  app.get('/api/v1/ai/review-items', { preHandler: requirePermission('ai:review:manage') }, async (request: FastifyRequest) => {
    const user = request.user!;
    const {
      page = '1', limit = '50', teamId, issueType, severity, status, contactId, conversationId, dateFrom, dateTo,
    } = request.query as QueryParams;
    const pageNum = Math.max(parseInt(page, 10), 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10), 1), 200);
    const where: any = { orgId: user.orgId };
    const scopedTeam = scopedTeamFilter(user, teamId);
    if (scopedTeam) where.teamId = scopedTeam;
    if (issueType) where.issueType = issueType;
    if (severity) where.severity = severity;
    if (status) where.status = status;
    if (contactId) where.contactId = contactId;
    if (conversationId) where.conversationId = conversationId;
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.createdAt.lte = new Date(dateTo);
    }

    const [items, total] = await Promise.all([
      prisma.aiReviewItem.findMany({
        where,
        include: {
          contact: { select: { id: true, fullName: true, crmName: true, phone: true, assignedUserId: true } },
          conversation: { select: { id: true, aiPaused: true } },
          aiActivityLog: true,
          reviewer: { select: { id: true, fullName: true } },
        },
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      }),
      prisma.aiReviewItem.count({ where }),
    ]);
    return { items, total, page: pageNum, limit: limitNum };
  });

  app.get('/api/v1/ai/review-items/:id', { preHandler: requirePermission('ai:review:manage') }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const item = await prisma.aiReviewItem.findFirst({
      where: { id, orgId: user.orgId },
      include: {
        contact: true,
        conversation: { include: { messages: { orderBy: { sentAt: 'desc' }, take: 20 } } },
        aiActivityLog: true,
      },
    });
    if (!item) return reply.status(404).send({ error: 'Review item not found' });
    if (!['owner', 'admin'].includes(user.role) && item.teamId && item.teamId !== user.teamId) {
      return reply.status(403).send({ error: 'Không có quyền xem ca AI này' });
    }
    return item;
  });

  app.patch('/api/v1/ai/review-items/:id', { preHandler: requirePermission('ai:review:manage') }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const body = request.body as { status?: string; suggestedFix?: string; assignToUserId?: string; pauseAi?: boolean };
    const existing = await prisma.aiReviewItem.findFirst({ where: { id, orgId: user.orgId }, select: { id: true, teamId: true, conversationId: true, contactId: true } });
    if (!existing) return reply.status(404).send({ error: 'Review item not found' });
    if (!['owner', 'admin'].includes(user.role) && existing.teamId && existing.teamId !== user.teamId) {
      return reply.status(403).send({ error: 'Không có quyền xử lý ca AI này' });
    }

    if (body.assignToUserId && existing.contactId) {
      await prisma.contact.updateMany({ where: { orgId: user.orgId, id: existing.contactId }, data: { assignedUserId: body.assignToUserId } });
    }
    if (body.pauseAi && existing.conversationId) {
      await prisma.conversation.updateMany({ where: { orgId: user.orgId, id: existing.conversationId }, data: { aiPaused: true } });
    }
    const updated = await prisma.aiReviewItem.update({
      where: { orgId_id: { orgId: user.orgId, id } },
      data: {
        status: body.status,
        suggestedFix: body.suggestedFix,
        reviewedBy: ['resolved', 'ignored'].includes(body.status || '') ? user.id : undefined,
        reviewedAt: ['resolved', 'ignored'].includes(body.status || '') ? new Date() : undefined,
      },
    });
    return updated;
  });

  app.post('/api/v1/ai/review-items', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const body = request.body as any;
    if (body.contactId) {
      const contact = await prisma.contact.findFirst({ where: { id: body.contactId, ...getContactAccessWhere(user) }, select: { id: true, teamId: true } });
      if (!contact) return reply.status(404).send({ error: 'Contact not found' });
      body.teamId = body.teamId || contact.teamId;
    }
    if (body.conversationId) {
      const conv = await prisma.conversation.findFirst({ where: { id: body.conversationId, ...getConversationAccessWhere(user) }, select: { id: true, teamId: true } });
      if (!conv) return reply.status(404).send({ error: 'Conversation not found' });
      body.teamId = body.teamId || conv.teamId;
    }
    const item = await prisma.aiReviewItem.create({
      data: {
        orgId: user.orgId,
        teamId: body.teamId || null,
        contactId: body.contactId || null,
        conversationId: body.conversationId || null,
        messageId: body.messageId || null,
        issueType: body.issueType || 'staff_flagged',
        severity: body.severity || 'medium',
        customerMessage: body.customerMessage || null,
        aiResponse: body.aiResponse || null,
        reason: body.reason || 'Nhân viên đánh dấu cần xem lại',
        suggestedFix: body.suggestedFix || null,
      },
    });
    return reply.status(201).send(item);
  });
}
