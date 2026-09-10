import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { requirePermission } from '../../shared/auth/require-permission.js';
import { assignContactToSale, reassignContact } from './assignment-service.js';
import { getContactAccessWhere } from '../../shared/utils/permission-scope.js';
import { logger } from '../../shared/utils/logger.js';

export async function assignmentRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);

  app.get('/api/v1/assignment/rules', { preHandler: requirePermission('assignment:manage') }, async (request) => {
    const user = request.user!;
    const rules = await prisma.assignmentRule.findMany({
      where: { orgId: user.orgId },
      include: { team: { select: { id: true, name: true } } },
      orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
    });
    return { rules };
  });

  app.put('/api/v1/assignment/rules', { preHandler: requirePermission('assignment:manage') }, async (request) => {
    const user = request.user!;
    const body = request.body as { rules: Array<Record<string, any>> };
    const rules = Array.isArray(body.rules) ? body.rules : [];
    await prisma.$transaction(async (tx) => {
      for (const rule of rules) {
        if (rule.id) {
          await tx.assignmentRule.update({
            where: { orgId_id: { orgId: user.orgId, id: rule.id } },
            data: {
              name: rule.name,
              teamId: rule.teamId || null,
              serviceName: rule.serviceName || null,
              source: rule.source || null,
              priority: Number(rule.priority ?? 100),
              strategy: rule.strategy || 'round_robin',
              saleUserIds: Array.isArray(rule.saleUserIds) ? rule.saleUserIds : [],
              isActive: rule.isActive !== false,
            },
          });
        } else {
          await tx.assignmentRule.create({
            data: {
              orgId: user.orgId,
              name: rule.name || 'Rule chia khách',
              teamId: rule.teamId || null,
              serviceName: rule.serviceName || null,
              source: rule.source || null,
              priority: Number(rule.priority ?? 100),
              strategy: rule.strategy || 'round_robin',
              saleUserIds: Array.isArray(rule.saleUserIds) ? rule.saleUserIds : [],
              isActive: rule.isActive !== false,
            },
          });
        }
      }
    });
    return { success: true };
  });

  app.post('/api/v1/contacts/:id/assign', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { id } = request.params as { id: string };
      const contact = await prisma.contact.findFirst({ where: { id, ...getContactAccessWhere(user) }, select: { id: true } });
      if (!contact) return reply.status(404).send({ error: 'Contact not found' });
      return await assignContactToSale(id, user.orgId, { type: 'staff', id: user.id });
    } catch (err) {
      logger.error('[assignment] assign error:', err);
      return reply.status(400).send({ error: err instanceof Error ? err.message : 'Failed to assign contact' });
    }
  });

  app.post('/api/v1/contacts/:id/reassign', { preHandler: requirePermission('contacts:assign') }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { id } = request.params as { id: string };
      const body = request.body as { newSaleId?: string | null; reason?: string };
      const existing = await prisma.contact.findFirst({ where: { id, ...getContactAccessWhere(user) }, select: { teamId: true } });
      if (!existing) return reply.status(404).send({ error: 'Contact not found' });
      if (user.role === 'branch_manager' && user.teamId && existing.teamId !== user.teamId) {
        return reply.status(403).send({ error: 'Không được phân khách ngoài cơ sở' });
      }
      return await reassignContact(user.orgId, id, body.newSaleId || null, body.reason || 'Phân lại khách', { type: 'staff', id: user.id });
    } catch (err) {
      logger.error('[assignment] reassign error:', err);
      return reply.status(400).send({ error: err instanceof Error ? err.message : 'Failed to reassign contact' });
    }
  });

  app.get('/api/v1/contacts/:id/assignment-history', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const contact = await prisma.contact.findFirst({ where: { id, ...getContactAccessWhere(user) }, select: { id: true } });
    if (!contact) return reply.status(404).send({ error: 'Contact not found' });
    const history = await prisma.contactAssignmentHistory.findMany({
      where: { orgId: user.orgId, contactId: id },
      include: { assignedUser: { select: { id: true, fullName: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return { history };
  });
}
