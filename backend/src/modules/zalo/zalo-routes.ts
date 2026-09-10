/**
 * Zalo account management routes.
 * All endpoints require authentication via authMiddleware.
 */
import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../auth/auth-middleware.js';
import { requireRole } from '../auth/role-middleware.js';
import { zaloPool } from './zalo-pool.js';
import { getTenantPrisma } from '../../shared/database/prisma-tenant.js';
import { getZaloAccountAccessWhere, canAccessZaloAccount } from '../../shared/utils/permission-scope.js';

export async function zaloRoutes(app: FastifyInstance): Promise<void> {
  // All routes in this plugin require auth
  app.addHook('preHandler', authMiddleware);

  // GET /api/v1/zalo-accounts — list accounts with live status from pool
  app.get('/api/v1/zalo-accounts', async (request) => {
    const user = request.user!;
    const db = getTenantPrisma(user.orgId);
    const where = getZaloAccountAccessWhere(user);

    const accounts = await db.zaloAccount.findMany({
      where,
      select: {
        id: true,
        zaloUid: true,
        displayName: true,
        avatarUrl: true,
        phone: true,
        status: true,
        sessionData: true,
        lastConnectedAt: true,
        disconnectedAt: true,
        lastReconnectAt: true,
        connectionError: true,
        createdAt: true,
        owner: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Merge live status from pool without exposing saved session data.
    return accounts.map(({ sessionData, ...account }) => {
      const hasSession = Boolean(sessionData);
      const poolStatus = zaloPool.getStatus(account.id);
      const liveStatus =
        poolStatus === 'disconnected' && hasSession && ['connected', 'connecting', 'reconnecting'].includes(account.status)
          ? 'reconnecting'
          : poolStatus;

      return {
        ...account,
        hasSession,
        liveStatus,
      };
    });
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

      await db.zaloAccount.update({
        where: { id },
        data: { status: 'reconnecting', lastReconnectAt: new Date(), connectionError: null },
      });

      // Fire-and-forget — QR delivered via Socket.IO
      zaloPool.loginQR(id, user.orgId).catch(async () => {
        await db.zaloAccount
          .updateMany({
            where: { id, orgId: user.orgId },
            data: { status: 'need_qr', disconnectedAt: new Date(), connectionError: 'QR login failed' },
          })
          .catch(() => {});
        // errors are emitted via socket; no need to crash here
      });

      return { message: 'QR login initiated — subscribe to account:' + id + ' socket room', status: 'connecting' };
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

      await db.zaloAccount.update({
        where: { id },
        data: { status: 'reconnecting', lastReconnectAt: new Date(), connectionError: null },
      });

      // Fire-and-forget — result emitted via Socket.IO
      zaloPool.reconnect(id, user.orgId, session).catch(async () => {
        await db.zaloAccount
          .updateMany({
            where: { id, orgId: user.orgId },
            data: { status: 'reconnecting', disconnectedAt: new Date(), connectionError: 'Reconnect failed' },
          })
          .catch(() => {});
      });

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

      const hasAccess = await canAccessZaloAccount(user, id);
      if (!hasAccess) {
        return reply.status(403).send({ error: 'Forbidden' });
      }

      const db = getTenantPrisma(user.orgId);
      const account = await db.zaloAccount.findFirst({
        where: { id },
        select: { id: true, status: true, sessionData: true, disconnectedAt: true, lastReconnectAt: true },
      });
      if (!account) {
        return reply.status(404).send({ error: 'Account not found' });
      }

      const hasSession = Boolean(account.sessionData);
      const poolStatus = zaloPool.getStatus(id);
      const liveStatus =
        poolStatus === 'disconnected' && hasSession && ['connected', 'connecting', 'reconnecting'].includes(account.status)
          ? 'reconnecting'
          : poolStatus;

      return {
        accountId: id,
        status: account.status,
        hasSession,
        liveStatus,
      };
    },
  );

  // GET /api/v1/zalo-accounts/online-contacts — list all online contacts across allowed accounts
  app.get(
    '/api/v1/zalo-accounts/online-contacts',
    async (request, reply) => {
      const user = request.user!;
      const db = getTenantPrisma(user.orgId);
      const where = getZaloAccountAccessWhere(user);

      // Get all allowed account IDs for this user
      const allowedAccounts = await db.zaloAccount.findMany({
        where,
        select: { id: true, displayName: true }
      });
      const allowedAccountIds = allowedAccounts.map(a => a.id);
      
      const { zaloOnlineContactsService } = await import('./zalo-online-contacts.service.js');
      const onlineContacts = await zaloOnlineContactsService.getOnlineContacts(user.orgId, allowedAccountIds);

      // Lookup contact details and map response
      const accountMap = new Map(allowedAccounts.map(a => [a.id, a.displayName || '']));
      const contactIds = onlineContacts.map(c => c.contactId);
      
      const contactsData = await db.contact.findMany({
        where: { id: { in: contactIds } },
        select: { id: true, fullName: true, avatarUrl: true, phone: true },
      });
      const contactsMap = new Map(contactsData.map(c => [c.id, c]));

      // Also get conversationId to allow quick navigation
      const conversations = await db.conversation.findMany({
        where: { contactId: { in: contactIds }, threadType: 'user' },
        select: { id: true, contactId: true, zaloAccountId: true }
      });
      const convMap = new Map();
      for (const conv of conversations) {
        convMap.set(`${conv.zaloAccountId}_${conv.contactId}`, conv.id);
      }

      const now = Date.now();
      const response = onlineContacts.map(oc => {
        const c = contactsMap.get(oc.contactId);
        const convId = convMap.get(`${oc.zaloAccountId}_${oc.contactId}`);
        const durationMins = Math.floor((now - oc.lastActiveAt) / 60000);
        let presenceText = 'Đang online';
        if (!oc.isOnline) {
          if (durationMins < 60) presenceText = `Hoạt động ${durationMins} phút trước`;
          else if (durationMins < 1440) presenceText = `Hoạt động ${Math.floor(durationMins / 60)} giờ trước`;
          else presenceText = `Hoạt động ${Math.floor(durationMins / 1440)} ngày trước`;
        }

        return {
          contactId: oc.contactId,
          zaloAccountId: oc.zaloAccountId,
          zaloAccountName: accountMap.get(oc.zaloAccountId),
          displayName: c?.fullName || 'Unknown',
          avatar: c?.avatarUrl || null,
          phone: c?.phone || null,
          conversationId: convId || null,
          isOnline: oc.isOnline,
          lastActiveAt: oc.lastActiveAt,
          presenceText
        };
      });

      return { onlineContacts: response };
    }
  );
}
