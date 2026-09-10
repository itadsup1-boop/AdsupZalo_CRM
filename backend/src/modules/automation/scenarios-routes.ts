import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { logger } from '../../shared/utils/logger.js';

export async function scenariosRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get('/api/v1/scenarios', async (request: FastifyRequest) => {
    const user = request.user!;
    const scenarios = await prisma.messageScenario.findMany({
      where: { orgId: user.orgId },
      include: {
        steps: { orderBy: { orderIndex: 'asc' } },
        triggerTag: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return { scenarios };
  });

  app.post('/api/v1/scenarios', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { name, description, category, triggerTagId, isActive, steps } = request.body as any;
      
      if (!name) return reply.status(400).send({ error: 'Name is required' });

      const scenario = await prisma.messageScenario.create({
        data: {
          orgId: user.orgId,
          name,
          description,
          category,
          triggerTagId,
          isActive: isActive !== undefined ? isActive : true,
          steps: {
            create: Array.isArray(steps) ? steps.map((s: any, index: number) => ({
              content: s.content,
              delayType: s.delayType || 'relative',
              delayMinutes: s.delayMinutes || 0,
              absoluteTime: s.absoluteTime ? new Date(s.absoluteTime) : null,
              orderIndex: s.orderIndex !== undefined ? s.orderIndex : index,
              isActive: s.isActive !== undefined ? s.isActive : true,
            })) : [],
          }
        },
        include: { steps: true, triggerTag: true }
      });
      
      return reply.status(201).send(scenario);
    } catch (error) {
      logger.error('[scenarios] Create error:', error);
      return reply.status(500).send({ error: 'Failed to create scenario' });
    }
  });

  app.put('/api/v1/scenarios/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { id } = request.params as { id: string };
      const { name, description, category, triggerTagId, isActive, steps } = request.body as any;

      const existing = await prisma.messageScenario.findFirst({ where: { id, orgId: user.orgId } });
      if (!existing) return reply.status(404).send({ error: 'Scenario not found' });

      // Update scenario and its steps (simplest way is to delete old steps and recreate)
      const updated = await prisma.$transaction(async (tx) => {
        if (steps) {
          // Delete pending scheduled messages for this scenario first
          await tx.scheduledMessage.deleteMany({
            where: { scenarioId: id, status: 'pending' }
          });
          // For sent/failed scheduled messages, set stepId to null to avoid constraint issues
          await tx.scheduledMessage.updateMany({
            where: { scenarioId: id },
            data: { stepId: null }
          });
          // Now it is safe to delete old steps
          await tx.messageScenarioStep.deleteMany({ where: { scenarioId: id } });
        }
        return tx.messageScenario.update({
          where: { id },
          data: {
            name: name !== undefined ? name : existing.name,
            description: description !== undefined ? description : existing.description,
            category: category !== undefined ? category : existing.category,
            triggerTagId: triggerTagId !== undefined ? triggerTagId : existing.triggerTagId,
            isActive: isActive !== undefined ? isActive : existing.isActive,
            ...(steps ? {
              steps: {
                create: steps.map((s: any, index: number) => ({
                  content: s.content,
                  delayType: s.delayType || 'relative',
                  delayMinutes: s.delayMinutes || 0,
                  absoluteTime: s.absoluteTime ? new Date(s.absoluteTime) : null,
                  orderIndex: s.orderIndex !== undefined ? s.orderIndex : index,
                  isActive: s.isActive !== undefined ? s.isActive : true,
                }))
              }
            } : {})
          },
          include: { steps: { orderBy: { orderIndex: 'asc' } }, triggerTag: true }
        });
      });

      return updated;
    } catch (error) {
      logger.error('[scenarios] Update error:', error);
      return reply.status(500).send({ error: 'Failed to update scenario' });
    }
  });

  app.delete('/api/v1/scenarios/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { id } = request.params as { id: string };
      const existing = await prisma.messageScenario.findFirst({ where: { id, orgId: user.orgId } });
      if (!existing) return reply.status(404).send({ error: 'Scenario not found' });
      await prisma.$transaction(async (tx) => {
        // Delete pending scheduled messages for this scenario first
        await tx.scheduledMessage.deleteMany({
          where: { scenarioId: id, status: 'pending' }
        });
        // Clear scenarioId and stepId for other scheduled messages to avoid constraint violations
        await tx.scheduledMessage.updateMany({
          where: { scenarioId: id },
          data: { scenarioId: null, stepId: null }
        });
        // Delete the scenario itself
        await tx.messageScenario.delete({ where: { id } });
      });
      return { success: true };
    } catch (error) {
      logger.error('[scenarios] Delete error:', error);
      return reply.status(500).send({ error: 'Failed to delete scenario' });
    }
  });

  app.get('/api/v1/scenarios/scheduled-logs', async (request: FastifyRequest) => {
    try {
      const user = request.user!;
      const logs = await prisma.scheduledMessage.findMany({
        where: { orgId: user.orgId },
        include: {
          contact: { select: { id: true, fullName: true, phone: true } },
          scenario: { select: { id: true, name: true } },
          step: { select: { id: true, content: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      return { logs };
    } catch (error) {
      logger.error('[scenarios] Get logs error:', error);
      return { logs: [] };
    }
  });
}
