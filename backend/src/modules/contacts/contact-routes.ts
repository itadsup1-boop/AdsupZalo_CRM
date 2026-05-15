/**
 * contact-routes.ts — REST API for CRM contact management.
 * Supports list, detail, create, update, delete, pipeline view, and tag updates.
 * All routes require JWT auth and are scoped to user's org.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getTenantPrisma } from '../../shared/database/prisma-tenant.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { requireRole } from '../auth/role-middleware.js';
import { logger } from '../../shared/utils/logger.js';
import { mergeContacts } from './merge-service.js';
import { runContactIntelligence } from './contact-intelligence.js';
import { runAutomationRules } from '../automation/automation-service.js';

type QueryParams = Record<string, string>;

export async function contactRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // ── GET /api/v1/contacts — list with filters and pagination ───────────────
  app.get('/api/v1/contacts', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const {
        page = '1',
        limit = '50',
        search = '',
        source = '',
        status = '',
        assignedUserId = '',
      } = request.query as QueryParams;

      const db = getTenantPrisma(user.orgId);

      // ── Build ownership-safe where clause ─────────────────────────────────
      const where: any = { mergedInto: null };
      
      if (user.role === 'member') {
        // Members see their assigned contacts OR unassigned ones (to take them)
        where.OR = [
          { assignedUserId: user.id },
          { assignedUserId: null }
        ];
      } else if (assignedUserId) {
        where.assignedUserId = assignedUserId;
      }

      if (source) where.source = source;
      if (status) where.status = status;
      
      if (search) {
        const searchClause = {
          OR: [
            { fullName: { contains: search, mode: 'insensitive' } },
            { crmName: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search } },
            { email: { contains: search, mode: 'insensitive' } },
          ],
        };
        // Ensure search doesn't break the ownership OR above
        if (where.OR) {
          where.AND = [ { OR: where.OR }, searchClause ];
          delete where.OR;
        } else {
          where.AND = [ searchClause ];
        }
      }

      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);

      const [contacts, total] = await Promise.all([
        db.contact.findMany({
          where,
          include: {
            assignedUser: { select: { id: true, fullName: true, email: true } },
            _count: { select: { conversations: true, appointments: true } },
          },
          orderBy: { updatedAt: 'desc' },
          skip: (pageNum - 1) * limitNum,
          take: limitNum,
        }),
        db.contact.count({ where }),
      ]);

      return { contacts, total, page: pageNum, limit: limitNum };
    } catch (err) {
      logger.error('[contacts] List error:', err);
      return reply.status(500).send({ error: 'Failed to fetch contacts' });
    }
  });

  // ── GET /api/v1/contacts/pipeline — kanban grouped by generic status ──────
  app.get('/api/v1/contacts/pipeline', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const orgId = user.orgId;

      const db = getTenantPrisma(orgId);
      const whereBase: any = { status: { not: null }, mergedInto: null };
      
      if (user.role === 'member') {
        whereBase.OR = [
          { assignedUserId: user.id },
          { assignedUserId: null }
        ];
      }

      const pipeline = await db.contact.groupBy({
        by: ['status'],
        where: whereBase,
        _count: true,
      });

      // Fetch contacts per status for kanban cards (limit 20 per column)
      const statuses = pipeline.map((g: any) => g.status ?? 'unknown');
      const contactsByStatus: Record<string, any[]> = {};

      await Promise.all(
        statuses.map(async (st: string) => {
          const where: any = { status: st ?? null, mergedInto: null };
          if (user.role === 'member') {
            where.OR = [
              { assignedUserId: user.id },
              { assignedUserId: null }
            ];
          }
          const contacts = await db.contact.findMany({
            where,
            select: {
              id: true,
              fullName: true,
              phone: true,
              email: true,
              avatarUrl: true,
              status: true,
              nextAppointment: true,
              assignedUser: { select: { id: true, fullName: true } },
            },
            orderBy: { updatedAt: 'desc' },
            take: 20,
          });
          contactsByStatus[st ?? 'unknown'] = contacts;
        }),
      );

      const result = pipeline.map((g: any) => ({
        status: g.status ?? 'unknown',
        count: g._count,
        contacts: contactsByStatus[g.status ?? 'unknown'] ?? [],
      }));

      return { pipeline: result };
    } catch (err) {
      logger.error('[contacts] Pipeline error:', err);
      return reply.status(500).send({ error: 'Failed to fetch pipeline' });
    }
  });

  // ── GET /api/v1/contacts/:id — detail with appointments + conversation count
  app.get('/api/v1/contacts/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { id } = request.params as { id: string };

      const db = getTenantPrisma(user.orgId);
      const contact = await db.contact.findFirst({
        where: { id },
        include: {
          assignedUser: { select: { id: true, fullName: true, email: true } },
          appointments: { orderBy: { appointmentDate: 'desc' }, take: 10 },
          _count: { select: { conversations: true } },
        },
      });

      if (!contact) return reply.status(404).send({ error: 'Contact not found' });
      
      if (user.role === 'member') {
        // Can only view if assigned to them or unassigned
        if (contact.assignedUserId !== null && contact.assignedUserId !== user.id) {
          return reply.status(403).send({ error: 'Forbidden: You do not have access to this contact' });
        }
      }
      
      return contact;
    } catch (err) {
      logger.error('[contacts] Detail error:', err);
      return reply.status(500).send({ error: 'Failed to fetch contact' });
    }
  });

  // ── POST /api/v1/contacts — create new contact ────────────────────────────
  app.post('/api/v1/contacts', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const body = request.body as Record<string, any>;

      const db = getTenantPrisma(user.orgId);
      const contact = await db.contact.create({
        data: {
          orgId: user.orgId,
          fullName: body.fullName,
          crmName: body.crmName,
          phone: body.phone,
          email: body.email,
          zaloUid: body.zaloUid,
          avatarUrl: body.avatarUrl,
          source: body.source,
          sourceDate: body.sourceDate ? new Date(body.sourceDate) : undefined,
          status: body.status ?? 'new',
          nextAppointment: body.nextAppointment ? new Date(body.nextAppointment) : undefined,
          assignedUserId: user.role === 'member' ? user.id : body.assignedUserId,
          notes: body.notes,
          tags: body.tags ?? [],
          metadata: body.metadata ?? {},
        },
      });

      const org = await db.organization.findUnique({
        where: { id: user.orgId },
        select: { id: true, name: true },
      });
      void runAutomationRules({
        trigger: 'contact_created',
        orgId: user.orgId,
        org,
        contact: {
          id: contact.id,
          fullName: contact.fullName,
          phone: contact.phone,
          status: contact.status,
          source: contact.source,
          assignedUserId: contact.assignedUserId,
        },
      });

      return reply.status(201).send(contact);
    } catch (err) {
      logger.error('[contacts] Create error:', err);
      return reply.status(500).send({ error: 'Failed to create contact' });
    }
  });

  // ── PUT /api/v1/contacts/:id — update CRM fields ─────────────────────────
  app.put('/api/v1/contacts/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { id } = request.params as { id: string };
      const body = request.body as Record<string, any>;

      const db = getTenantPrisma(user.orgId);

      // Pre-fetch for permission check
      const existing = await db.contact.findFirst({
        where: { id },
        select: { status: true, assignedUserId: true },
      });
      if (!existing) return reply.status(404).send({ error: 'Contact not found' });
      
      if (user.role === 'member') {
        // PERMISSION FIX: Member can update IF assigned to them OR IF unassigned (null)
        const canUpdate = existing.assignedUserId === user.id || existing.assignedUserId === null;
        if (!canUpdate) {
          return reply.status(403).send({ error: 'Forbidden: You do not own this contact' });
        }
      }

      const updateData: any = {
        fullName: body.fullName,
        crmName: body.crmName,
        phone: body.phone,
        email: body.email,
        avatarUrl: body.avatarUrl,
        source: body.source,
        sourceDate: body.sourceDate ? new Date(body.sourceDate) : undefined,
        status: body.status,
        nextAppointment: body.nextAppointment ? new Date(body.nextAppointment) : undefined,
        // Members cannot re-assign contacts to others, but they can "claim" an unassigned one
        assignedUserId: user.role === 'member' 
          ? (existing.assignedUserId === null ? user.id : undefined) 
          : body.assignedUserId,
        notes: body.notes,
        tags: body.tags,
        metadata: body.metadata,
      };
      
      if (body.firstContactDate !== undefined) {
        updateData.firstContactDate = body.firstContactDate ? new Date(body.firstContactDate) : null;
      }

      const updated = await db.contact.update({
        where: { id },
        data: updateData,
        include: {
          assignedUser: { select: { id: true, fullName: true, email: true } },
          appointments: { orderBy: { appointmentDate: 'desc' }, take: 10 },
          _count: { select: { conversations: true } },
        },
      });

      if (existing.status !== updated?.status) {
        const org = await db.organization.findUnique({
          where: { id: user.orgId },
          select: { id: true, name: true },
        });
        void runAutomationRules({
          trigger: 'status_changed',
          orgId: user.orgId,
          org,
          contact: {
            id: updated!.id,
            fullName: updated!.fullName,
            phone: updated!.phone,
            status: updated!.status,
            source: updated!.source,
            assignedUserId: updated!.assignedUserId,
          },
        });
      }

      return updated;
    } catch (err) {
      logger.error('[contacts] Update error:', err);
      return reply.status(500).send({ error: 'Failed to update contact' });
    }
  });

  // ── PUT /api/v1/contacts/:id/tags — update tags only ─────────────────────
  app.put('/api/v1/contacts/:id/tags', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { id } = request.params as { id: string };
      const { tags } = request.body as { tags: string[] };

      if (!Array.isArray(tags)) return reply.status(400).send({ error: 'tags must be an array' });

      const db = getTenantPrisma(user.orgId);
      
      const existing = await db.contact.findFirst({ where: { id }, select: { assignedUserId: true } });
      if (!existing) return reply.status(404).send({ error: 'Contact not found' });

      if (user.role === 'member') {
        const canUpdate = existing.assignedUserId === user.id || existing.assignedUserId === null;
        if (!canUpdate) return reply.status(403).send({ error: 'Forbidden' });
      }

      await db.contact.update({ where: { id }, data: { tags } });
      return { success: true };
    } catch (err) {
      logger.error('[contacts] Update tags error:', err);
      return reply.status(500).send({ error: 'Failed to update tags' });
    }
  });

  // ── DELETE /api/v1/contacts/:id ───────────────────────────────────────────
  app.delete('/api/v1/contacts/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { id } = request.params as { id: string };

      const db = getTenantPrisma(user.orgId);
      
      const existing = await db.contact.findFirst({ where: { id }, select: { assignedUserId: true } });
      if (!existing) return reply.status(404).send({ error: 'Contact not found' });

      if (user.role === 'member') {
        if (existing.assignedUserId !== user.id) {
          return reply.status(403).send({ error: 'Forbidden: Members can only delete their own assigned contacts' });
        }
      }

      await db.contact.delete({ where: { id } });
      return { success: true };
    } catch (err) {
      logger.error('[contacts] Delete error:', err);
      return reply.status(500).send({ error: 'Failed to delete contact' });
    }
  });

  // ── GET /api/v1/contacts/duplicates — list unresolved duplicate groups ────
  app.get('/api/v1/contacts/duplicates', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { page = '1', limit = '20', resolved = 'false' } = request.query as QueryParams;

      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const db = getTenantPrisma(user.orgId);
      const where = { resolved: resolved === 'true' };

      const [groups, total] = await Promise.all([
        db.duplicateGroup.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (pageNum - 1) * limitNum,
          take: limitNum,
        }),
        db.duplicateGroup.count({ where }),
      ]);

      // Expand contact data for each group
      const expanded = await Promise.all(
        groups.map(async (group: any) => {
          const contacts = await db.contact.findMany({
            where: { id: { in: group.contactIds } },
            select: {
              id: true, fullName: true, phone: true, email: true,
              zaloUid: true, avatarUrl: true, source: true, status: true,
              tags: true, createdAt: true, leadScore: true, lastActivity: true,
              assignedUserId: true
            },
          });
          return { ...group, contacts };
        }),
      );

      return { groups: expanded, total, page: pageNum, limit: limitNum };
    } catch (err) {
      logger.error('[contacts] Duplicates list error:', err);
      return reply.status(500).send({ error: 'Failed to fetch duplicate groups' });
    }
  });

  // ── POST /api/v1/contacts/duplicates/:groupId/merge — merge a group ──────
  app.post('/api/v1/contacts/duplicates/:groupId/merge', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user!;
      const { groupId } = request.params as { groupId: string };
      const { primaryContactId } = request.body as { primaryContactId: string };

      if (!primaryContactId) return reply.status(400).send({ error: 'primaryContactId is required' });

      const db = getTenantPrisma(user.orgId);
      const group = await db.duplicateGroup.findFirst({
        where: { id: groupId, resolved: false },
      });
      if (!group) return reply.status(404).send({ error: 'Duplicate group not found' });

      const secondaryIds = group.contactIds.filter((cid: string) => cid !== primaryContactId);
      if (secondaryIds.length === 0) return reply.status(400).send({ error: 'Primary must be in the group' });

      const merged = await mergeContacts(user.orgId, user.id, primaryContactId, secondaryIds);

      // Resolve the group
      await db.duplicateGroup.update({ where: { id: groupId }, data: { resolved: true } });

      return merged;
    } catch (err: any) {
      logger.error('[contacts] Merge error:', err);
      return reply.status(400).send({ error: err.message || 'Failed to merge contacts' });
    }
  });

  // ── POST /api/v1/contacts/intelligence/recompute — admin/owner only ──────
  app.post(
    '/api/v1/contacts/intelligence/recompute',
    { preHandler: [authMiddleware, requireRole('owner', 'admin')] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Fire and forget — return 202 immediately
        runContactIntelligence().catch((err) => {
          logger.error('[contacts] Recompute error:', err);
        });
        return reply.status(202).send({ message: 'Intelligence recompute started' });
      } catch (err) {
        logger.error('[contacts] Recompute trigger error:', err);
        return reply.status(500).send({ error: 'Failed to start recompute' });
      }
    },
  );
}
