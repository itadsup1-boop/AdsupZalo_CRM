/**
 * contact-sub-resource-routes.ts — Sub-resource endpoints for contacts.
 * Provides appointments scoped to a specific contact.
 * All routes require JWT auth and are scoped to the user's org.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { logger } from '../../shared/utils/logger.js';

export async function contactSubResourceRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // ── GET /api/v1/contacts/:id/appointments — appointments for contact ───────
  app.get('/api/v1/contacts/:id/appointments', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { id } = request.params as { id: string };

      const appointments = await prisma.appointment.findMany({
        where: { contactId: id, orgId: user.orgId },
        orderBy: { appointmentDate: 'desc' },
        take: 20,
      });

      return { appointments };
    } catch (err) {
      logger.error('[contacts] Appointments by contact error:', err);
      return reply.status(500).send({ error: 'Failed to fetch appointments' });
    }
  });

  // ── GET /api/v1/contacts/:id/crm-tags — get CRM tags for contact ───────────
  app.get('/api/v1/contacts/:id/crm-tags', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { id } = request.params as { id: string };

      // Ensure contact belongs to org
      const contact = await prisma.contact.findFirst({
        where: { id, orgId: user.orgId }
      });
      if (!contact) return reply.status(404).send({ error: 'Contact not found' });

      const contactTags = await prisma.contactTag.findMany({
        where: { contactId: id },
        include: { tag: true }
      });

      return { tags: contactTags.map(ct => ct.tag) };
    } catch (err) {
      logger.error('[contacts] Get CRM tags error:', err);
      return reply.status(500).send({ error: 'Failed to fetch contact tags' });
    }
  });

  // ── POST /api/v1/contacts/:id/crm-tags — attach a CRM tag ─────────────────
  app.post('/api/v1/contacts/:id/crm-tags', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { id } = request.params as { id: string };
      const { tagId } = request.body as { tagId: string };

      if (!tagId) return reply.status(400).send({ error: 'tagId is required' });

      // Verify contact
      const contact = await prisma.contact.findFirst({
        where: { id, orgId: user.orgId }
      });
      if (!contact) return reply.status(404).send({ error: 'Contact not found' });

      // Verify tag
      const tag = await prisma.tag.findFirst({
        where: { id: tagId, orgId: user.orgId }
      });
      if (!tag) return reply.status(404).send({ error: 'Tag not found' });

      // Avoid duplicates
      const existing = await prisma.contactTag.findFirst({
        where: { contactId: id, tagId }
      });

      if (existing) {
        return reply.status(200).send({ success: true, message: 'Tag already attached' });
      }

      const contactTag = await prisma.contactTag.create({
        data: { orgId: user.orgId, contactId: id, tagId },
        include: { tag: true }
      }) as any;

      // Trigger tag-based automation
      try {
        await triggerTagAutomation(user.orgId, id, tagId);
      } catch (autoErr) {
        logger.error('[automation] Failed to trigger automation for tag:', autoErr);
      }

      return reply.status(201).send(contactTag.tag);
    } catch (err) {
      logger.error('[contacts] Add CRM tag error:', err);
      return reply.status(500).send({ error: 'Failed to add tag to contact' });
    }
  });

  // ── DELETE /api/v1/contacts/:id/crm-tags/:tagId — detach a CRM tag ────────
  app.delete('/api/v1/contacts/:id/crm-tags/:tagId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { id, tagId } = request.params as { id: string; tagId: string };

      // Verify contact
      const contact = await prisma.contact.findFirst({
        where: { id, orgId: user.orgId }
      });
      if (!contact) return reply.status(404).send({ error: 'Contact not found' });

      await prisma.contactTag.deleteMany({
        where: { contactId: id, tagId }
      });

      return { success: true };
    } catch (err) {
      logger.error('[contacts] Remove CRM tag error:', err);
      return reply.status(500).send({ error: 'Failed to remove tag from contact' });
    }
  });
}

async function triggerTagAutomation(orgId: string, contactId: string, tagId: string) {
  const scenarios = await prisma.messageScenario.findMany({
    where: {
      orgId,
      triggerTagId: tagId,
      isActive: true,
    },
    include: {
      steps: true,
    },
  });

  logger.info(`[automation] Triggering ${scenarios.length} scenarios for contactId=${contactId}, tagId=${tagId}`);

  for (const scenario of scenarios) {
    for (const step of scenario.steps) {
      const scheduledAt = new Date(Date.now() + step.delayMinutes * 60 * 1000);
      
      const existing = await prisma.scheduledMessage.findFirst({
        where: {
          orgId,
          contactId,
          scenarioId: scenario.id,
          stepId: step.id,
          status: 'pending',
        },
      });

      if (existing) continue;

      await prisma.scheduledMessage.create({
        data: {
          orgId,
          contactId,
          scenarioId: scenario.id,
          stepId: step.id,
          content: step.content,
          scheduledAt,
          status: 'pending',
        },
      });
    }
  }
}
