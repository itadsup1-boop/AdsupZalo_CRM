/**
 * Zalo account management routes.
 * All endpoints require authentication via authMiddleware.
 */
import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../auth/auth-middleware.js';
import { requireRole } from '../auth/role-middleware.js';
import { zaloPool } from './zalo-pool.js';
import { getTenantPrisma } from '../../shared/database/prisma-tenant.js';

export async function zaloRoutes(app: FastifyInstance): Promise<void> {
  // All routes in this plugin require auth
  app.addHook('preHandler', authMiddleware);

  // GET /api/v1/zalo-accounts — list accounts with live status from pool
  app.get('/api/v1/zalo-accounts', async (request) => {
    const user = request.user!;
    const db = getTenantPrisma(user.orgId);

    const where: any = {};
    if (user.role === 'member') {
      // Members only see accounts they have explicit access to
      where.access = { some: { userId: user.id } };
    }

    const accounts = await db.zaloAccount.findMany({
      where,
      select: {
        id: true,
        zaloUid: true,
        displayName: true,
        avatarUrl: true,
        phone: true,
        status: true,
        lastConnectedAt: true,
        createdAt: true,
        owner: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Merge live status from pool
    return accounts.map((a) => ({
      ...a,
      liveStatus: zaloPool.getStatus(a.id),
    }));
  });

  // POST /api/v1/zalo-accounts — create a new account record
  app.post<{ Body: { displayName?: string } }>(
    '/api/v1/zalo-accounts',
    { preHandler: requireRole('owner', 'admin') },
    async (request, reply) => {
      const user = request.user!;
      const { displayName } = request.body ?? {};

      const db = getTenantPrisma(user.orgId);
      const account = await db.zaloAccount.create({
        data: {
          orgId: user.orgId,
          ownerUserId: user.id,
          displayName: displayName ?? null,
          status: 'qr_pending',
        },
      });

      return reply.status(201).send(account);
    },
  );

  // POST /api/v1/zalo-accounts/:id/login — initiate QR login
  app.post<{ Params: { id: string } }>(
    '/api/v1/zalo-accounts/:id/login',
    { preHandler: requireRole('owner', 'admin') },
    async (request, reply) => {
      const { id } = request.params;
      const user = request.user!;

      const db = getTenantPrisma(user.orgId);
      const account = await db.zaloAccount.findFirst({
        where: { id },
      });
      if (!account) {
        return reply.status(404).send({ error: 'Account not found' });
      }

      // Fire-and-forget — QR delivered via Socket.IO
      zaloPool.loginQR(id, user.orgId).catch(() => {
        // errors are emitted via socket; no need to crash here
      });

      return { message: 'QR login initiated — subscribe to account:' + id + ' socket room' };
    },
  );

  // POST /api/v1/zalo-accounts/:id/reconnect — force reconnect using saved session
  app.post<{ Params: { id: string } }>(
    '/api/v1/zalo-accounts/:id/reconnect',
    { preHandler: requireRole('owner', 'admin') },
    async (request, reply) => {
      const { id } = request.params;
      const user = request.user!;

      const db = getTenantPrisma(user.orgId);
      const account = await db.zaloAccount.findFirst({
        where: { id },
      });
      if (!account) {
        return reply.status(404).send({ error: 'Account not found' });
      }

      const session = account.sessionData as {
        cookie: any;
        imei: string;
        userAgent: string;
      } | null;

      if (!session?.imei) {
        return reply.status(400).send({ error: 'No saved session — please login with QR first' });
      }

      // Fire-and-forget — result emitted via Socket.IO
      zaloPool.reconnect(id, user.orgId, session).catch(() => {});

      return { message: 'Reconnect initiated' };
    },
  );

  // DELETE /api/v1/zalo-accounts/:id — disconnect and delete record
  app.delete<{ Params: { id: string } }>(
    '/api/v1/zalo-accounts/:id',
    { preHandler: requireRole('owner', 'admin') },
    async (request, reply) => {
      const { id } = request.params;
      const user = request.user!;

      const db = getTenantPrisma(user.orgId);
      const account = await db.zaloAccount.findFirst({
        where: { id },
      });
      if (!account) {
        return reply.status(404).send({ error: 'Account not found' });
      }

      zaloPool.disconnect(id);
      await db.zaloAccount.delete({ where: { id } });

      return reply.status(204).send();
    },
  );

  // GET /api/v1/zalo-accounts/:id/status — live status from pool
  app.get<{ Params: { id: string } }>(
    '/api/v1/zalo-accounts/:id/status',
    async (request, reply) => {
      const { id } = request.params;
      const user = request.user!;

      const db = getTenantPrisma(user.orgId);
      const account = await db.zaloAccount.findFirst({
        where: { id },
        select: { id: true, status: true },
      });
      if (!account) {
        return reply.status(404).send({ error: 'Account not found' });
      }

      return { accountId: id, liveStatus: zaloPool.getStatus(id) };
    },
  );
}
