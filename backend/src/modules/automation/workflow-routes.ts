import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { logger } from '../../shared/utils/logger.js';

export async function workflowRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // List all workflows
  app.get('/api/v1/automations/workflows', async (request: FastifyRequest) => {
    const user = request.user!;
    const workflows = await prisma.automationWorkflow.findMany({
      where: { orgId: user.orgId },
      include: {
        triggerTag: true,
        _count: {
          select: { runs: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    return { workflows };
  });

  // Get workflow by ID
  app.get('/api/v1/automations/workflows/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const workflow = await prisma.automationWorkflow.findFirst({
      where: { id, orgId: user.orgId },
      include: { triggerTag: true }
    });
    if (!workflow) return reply.status(404).send({ error: 'Workflow not found' });
    return workflow;
  });

  // Create workflow
  app.post('/api/v1/automations/workflows', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { name, description, triggerTagId, status, nodes, edges } = request.body as any;
      if (!name) return reply.status(400).send({ error: 'Name is required' });

      const workflow = await prisma.automationWorkflow.create({
        data: {
          orgId: user.orgId,
          name,
          description,
          triggerTagId: triggerTagId || null,
          status: status || 'draft',
          nodes: nodes || [],
          edges: edges || [],
          createdBy: user.id
        }
      });
      return reply.status(201).send(workflow);
    } catch (error) {
      logger.error('[automation] Create workflow error:', error);
      return reply.status(500).send({ error: error instanceof Error ? error.message : 'Failed to create workflow' });
    }
  });

  // Update workflow
  app.put('/api/v1/automations/workflows/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { id } = request.params as { id: string };
      const { name, description, triggerTagId, status, nodes, edges } = request.body as any;

      const workflow = await prisma.automationWorkflow.findFirst({ where: { id, orgId: user.orgId } });
      if (!workflow) return reply.status(404).send({ error: 'Workflow not found' });

      const updated = await prisma.automationWorkflow.update({
        where: { id },
        data: {
          name: name !== undefined ? name : workflow.name,
          description: description !== undefined ? description : workflow.description,
          triggerTagId: triggerTagId !== undefined ? triggerTagId : workflow.triggerTagId,
          status: status !== undefined ? status : workflow.status,
          nodes: nodes !== undefined ? nodes : workflow.nodes,
          edges: edges !== undefined ? edges : workflow.edges,
        }
      });
      return updated;
    } catch (error) {
      logger.error('[automation] Update workflow error:', error);
      return reply.status(500).send({ error: error instanceof Error ? error.message : 'Failed to update workflow' });
    }
  });

  // Delete workflow
  app.delete('/api/v1/automations/workflows/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { id } = request.params as { id: string };
      const workflow = await prisma.automationWorkflow.findFirst({ where: { id, orgId: user.orgId } });
      if (!workflow) return reply.status(404).send({ error: 'Workflow not found' });

      await prisma.automationWorkflow.delete({ where: { id } });
      return { success: true };
    } catch (error) {
      logger.error('[automation] Create workflow error:', error);
      return reply.status(500).send({ error: error instanceof Error ? error.message : 'Failed to create workflow' });
    }
  });
}
