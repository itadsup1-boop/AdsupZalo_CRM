import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { logger } from '../../shared/utils/logger.js';

export async function tagsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // CRUD for Tags
  app.get('/api/v1/tags', async (request: FastifyRequest) => {
    const user = request.user!;
    const tags = await prisma.tag.findMany({
      where: { orgId: user.orgId },
      orderBy: { createdAt: 'desc' },
    });
    return { tags };
  });

  app.post('/api/v1/tags', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { name, color, description, isActive } = request.body as any;
      if (!name) return reply.status(400).send({ error: 'Name is required' });

      // Check duplicate
      const existing = await prisma.tag.findFirst({ where: { orgId: user.orgId, name } });
      if (existing) return reply.status(400).send({ error: 'Tag with this name already exists' });

      const tag = await prisma.tag.create({
        data: {
          orgId: user.orgId,
          name,
          color: color || '#3B82F6',
          description,
          isActive: isActive !== undefined ? isActive : true,
        },
      });
      return reply.status(201).send(tag);
    } catch (error) {
      logger.error('[tags] Create error:', error);
      return reply.status(500).send({ error: 'Failed to create tag' });
    }
  });

  app.put('/api/v1/tags/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { id } = request.params as { id: string };
      const { name, color, description, isActive } = request.body as any;

      const tag = await prisma.tag.findFirst({ where: { id, orgId: user.orgId } });
      if (!tag) return reply.status(404).send({ error: 'Tag not found' });

      if (name && name !== tag.name) {
        const existing = await prisma.tag.findFirst({ where: { orgId: user.orgId, name } });
        if (existing) return reply.status(400).send({ error: 'Tag with this name already exists' });
      }

      const updated = await prisma.tag.update({
        where: { id },
        data: {
          name: name !== undefined ? name : tag.name,
          color: color !== undefined ? color : tag.color,
          description: description !== undefined ? description : tag.description,
          isActive: isActive !== undefined ? isActive : tag.isActive,
        },
      });
      return updated;
    } catch (error) {
      logger.error('[tags] Update error:', error);
      return reply.status(500).send({ error: 'Failed to update tag' });
    }
  });

  app.delete('/api/v1/tags/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { id } = request.params as { id: string };
      const tag = await prisma.tag.findFirst({ where: { id, orgId: user.orgId } });
      if (!tag) return reply.status(404).send({ error: 'Tag not found' });

      await prisma.$transaction(async (tx) => {
        await tx.messageScenario.updateMany({
          where: { triggerTagId: id },
          data: { triggerTagId: null }
        });
        await tx.tag.delete({ where: { id } });
      });
      return { success: true };
    } catch (error) {
      logger.error('[tags] Delete error:', error);
      return reply.status(500).send({ error: 'Failed to delete tag' });
    }
  });

  // Assign tag to contact
  app.post('/api/v1/contacts/:contactId/tags', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { contactId } = request.params as { contactId: string };
      const { tagId } = request.body as { tagId: string };

      const contact = await prisma.contact.findFirst({ where: { id: contactId, orgId: user.orgId } });
      if (!contact) return reply.status(404).send({ error: 'Contact not found' });

      const tag = await prisma.tag.findFirst({ where: { id: tagId, orgId: user.orgId } });
      if (!tag) return reply.status(404).send({ error: 'Tag not found' });

      const existing = await prisma.contactTag.findFirst({ where: { orgId: user.orgId, contactId, tagId } });
      if (existing) return reply.status(400).send({ error: 'Tag already assigned' });

      await prisma.contactTag.create({
        data: { orgId: user.orgId, contactId, tagId },
      });

      // Check if any active scenarios use this tag as trigger
      try {
        const { triggerTagAutomation } = await import('../contacts/contact-sub-resource-routes.js');
        await triggerTagAutomation(user.orgId, contactId, tagId);
      } catch (autoErr) {
        logger.error('[tags] Failed to trigger automation for tag:', autoErr);
      }
      
      return { success: true };
    } catch (error) {
      logger.error('[tags] Assign tag error:', error);
      return reply.status(500).send({ error: 'Failed to assign tag' });
    }
  });

  // Remove tag from contact
  app.delete('/api/v1/contacts/:contactId/tags/:tagId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { contactId, tagId } = request.params as { contactId: string, tagId: string };

      const existing = await prisma.contactTag.findFirst({ where: { orgId: user.orgId, contactId, tagId } });
      if (!existing) return reply.status(404).send({ error: 'Tag assignment not found' });

      await prisma.contactTag.delete({ where: { id: existing.id } });
      return { success: true };
    } catch (error) {
      logger.error('[tags] Remove tag error:', error);
      return reply.status(500).send({ error: 'Failed to remove tag' });
    }
  });
}
