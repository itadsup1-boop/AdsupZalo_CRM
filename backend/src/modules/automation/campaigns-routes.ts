import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { logger } from '../../shared/utils/logger.js';

export async function campaignsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get('/api/v1/campaigns', async (request: FastifyRequest) => {
    const user = request.user!;
    const campaigns = await prisma.campaign.findMany({
      where: { orgId: user.orgId },
      include: {
        scenario: true,
        zaloAccount: { select: { id: true, displayName: true, avatarUrl: true } }
      },
      orderBy: { createdAt: 'desc' },
    });
    return { campaigns };
  });

  app.post('/api/v1/campaigns', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { name, scenarioId, zaloAccountId, targetTags } = request.body as any;
      
      if (!name || !scenarioId || !zaloAccountId) {
        return reply.status(400).send({ error: 'Name, scenarioId, and zaloAccountId are required' });
      }

      const campaign = await prisma.campaign.create({
        data: {
          orgId: user.orgId,
          name,
          scenarioId,
          zaloAccountId,
          status: 'draft',
          targetTags: Array.isArray(targetTags) ? targetTags : [],
        },
        include: { scenario: true, zaloAccount: { select: { id: true, displayName: true } } }
      });
      
      return reply.status(201).send(campaign);
    } catch (error) {
      logger.error('[campaigns] Create error:', error);
      return reply.status(500).send({ error: 'Failed to create campaign' });
    }
  });

  app.put('/api/v1/campaigns/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { id } = request.params as { id: string };
      const { name, scenarioId, zaloAccountId, targetTags, status } = request.body as any;

      const existing = await prisma.campaign.findFirst({ where: { id, orgId: user.orgId } });
      if (!existing) return reply.status(404).send({ error: 'Campaign not found' });

      const updated = await prisma.campaign.update({
        where: { id },
        data: {
          name: name !== undefined ? name : existing.name,
          scenarioId: scenarioId !== undefined ? scenarioId : existing.scenarioId,
          zaloAccountId: zaloAccountId !== undefined ? zaloAccountId : existing.zaloAccountId,
          targetTags: targetTags !== undefined ? targetTags : existing.targetTags,
          status: status !== undefined ? status : existing.status,
        },
        include: { scenario: true, zaloAccount: { select: { id: true, displayName: true } } }
      });

      return updated;
    } catch (error) {
      logger.error('[campaigns] Update error:', error);
      return reply.status(500).send({ error: 'Failed to update campaign' });
    }
  });

  app.delete('/api/v1/campaigns/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { id } = request.params as { id: string };
      const existing = await prisma.campaign.findFirst({ where: { id, orgId: user.orgId } });
      if (!existing) return reply.status(404).send({ error: 'Campaign not found' });

      await prisma.campaign.delete({ where: { id } });
      return { success: true };
    } catch (error) {
      logger.error('[campaigns] Delete error:', error);
      return reply.status(500).send({ error: 'Failed to delete campaign' });
    }
  });

  app.post('/api/v1/campaigns/:id/start', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { id } = request.params as { id: string };
      const campaign = await prisma.campaign.findFirst({ 
        where: { id, orgId: user.orgId },
        include: { scenario: { include: { steps: true } } }
      });
      if (!campaign) return reply.status(404).send({ error: 'Campaign not found' });
      if (campaign.status === 'running') return reply.status(400).send({ error: 'Campaign is already running' });

      // Get contacts to send to
      let contacts: any[] = [];
      const targetTags = campaign.targetTags as string[];
      if (Array.isArray(targetTags) && targetTags.length > 0) {
        const contactTags = await prisma.contactTag.findMany({
          where: {
            orgId: user.orgId,
            tagId: { in: targetTags }
          },
          select: { contactId: true }
        });
        const contactIds = Array.from(new Set(contactTags.map(ct => ct.contactId)));
        if (contactIds.length > 0) {
          contacts = await prisma.contact.findMany({
            where: {
              orgId: user.orgId,
              id: { in: contactIds }
            }
          });
        }
      } else {
        // Find all contacts for this org
        contacts = await prisma.contact.findMany({
          where: { orgId: user.orgId }
        });
      }

      // Schedule messages for each contact and step
      if (campaign.scenario && campaign.scenario.steps) {
        const activeSteps = campaign.scenario.steps.filter((s: any) => s.isActive);
        for (const contact of contacts) {
          for (const step of activeSteps) {
            const scheduledAt = new Date(Date.now() + step.delayMinutes * 60 * 1000);
            
            // Check if already scheduled for this contact, campaign and step
            const existing = await prisma.scheduledMessage.findFirst({
              where: {
                orgId: user.orgId,
                contactId: contact.id,
                campaignId: campaign.id,
                stepId: step.id,
                status: 'pending'
              }
            });

            if (existing) continue;

            await prisma.scheduledMessage.create({
              data: {
                orgId: user.orgId,
                contactId: contact.id,
                campaignId: campaign.id,
                scenarioId: campaign.scenarioId,
                stepId: step.id,
                zaloAccountId: campaign.zaloAccountId,
                content: step.content,
                scheduledAt,
                status: 'pending'
              }
            });
          }
        }
      }

      await prisma.campaign.update({
        where: { id },
        data: { status: 'running' }
      });
      
      return { success: true, message: 'Campaign started and messages scheduled' };
    } catch (error) {
      logger.error('[campaigns] Start error:', error);
      return reply.status(500).send({ error: 'Failed to start campaign' });
    }
  });

  // Pause campaign
  app.post('/api/v1/campaigns/:id/pause', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { id } = request.params as { id: string };
      const campaign = await prisma.campaign.findFirst({ where: { id, orgId: user.orgId } });
      if (!campaign) return reply.status(404).send({ error: 'Campaign not found' });

      await prisma.campaign.update({
        where: { id },
        data: { status: 'paused' }
      });
      
      return { success: true, message: 'Campaign paused' };
    } catch (error) {
      logger.error('[campaigns] Pause error:', error);
      return reply.status(500).send({ error: 'Failed to pause campaign' });
    }
  });
}
