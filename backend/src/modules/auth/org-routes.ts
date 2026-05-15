/**
 * Organization settings routes — get and update current org info.
 * GET is accessible to all authenticated users; PUT requires owner role.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getTenantPrisma } from '../../shared/database/prisma-tenant.js';
import { authMiddleware } from './auth-middleware.js';
import { requireRole } from './role-middleware.js';
import { logger } from '../../shared/utils/logger.js';
import { generateJoinToken } from './auth-service.js';

export async function orgRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // GET /api/v1/organization — get current org info
  app.get('/api/v1/organization', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    try {
      const db = getTenantPrisma(user.orgId);
      const org = await db.organization.findUnique({
        where: { id: user.orgId },
        select: { id: true, name: true, createdAt: true, updatedAt: true },
      });
      if (!org) return reply.status(404).send({ error: 'Organization not found' });
      return org;
    } catch {
      return reply.status(500).send({ error: 'Failed to fetch organization' });
    }
  });

  // PUT /api/v1/organization — update org name (owner only)
  app.put(
    '/api/v1/organization',
    { preHandler: requireRole('owner') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const { name } = request.body as { name: string };
      if (!name?.trim()) return reply.status(400).send({ error: 'Tên tổ chức là bắt buộc' });

      try {
        const db = getTenantPrisma(user.orgId);
        const org = await db.organization.update({
          where: { id: user.orgId },
          data: { name: name.trim() },
          select: { id: true, name: true, createdAt: true, updatedAt: true },
        });
        logger.info(`Organization updated: ${org.name} by ${user.email}`);
        return org;
      } catch {
        return reply.status(500).send({ error: 'Failed to update organization' });
      }
    },
  );

  // POST /api/v1/organization/invite-token — generate a secure join token (owner/admin)
  app.post(
    '/api/v1/organization/invite-token',
    { preHandler: requireRole('owner', 'admin') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      
      try {
        const db = getTenantPrisma(user.orgId);
        const org = await db.organization.findUnique({
          where: { id: user.orgId },
          select: { name: true },
        });

        if (!org) return reply.status(404).send({ error: 'Organization not found' });

        const token = await generateJoinToken(user.orgId, org.name);
        return { token };
      } catch (err) {
        logger.error('Failed to generate invite token:', err);
        return reply.status(500).send({ error: 'Không thể tạo mã tham gia' });
      }
    }
  );
}
