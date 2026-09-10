/**
 * Zalo access middleware — checks if user has sufficient permission on a Zalo account.
 * Permission hierarchy: admin > chat > read.
 * Owner/admin roles bypass the check (they have access to all accounts in their org).
 */
import type { FastifyRequest, FastifyReply } from 'fastify';
import { getTenantPrisma } from '../../shared/database/prisma-tenant.js';
import { getZaloAccountAccessWhere } from '../../shared/utils/permission-scope.js';

type Permission = 'read' | 'chat' | 'admin';

// Factory: returns a preHandler that checks the user has at least minPermission on the Zalo account
export function requireZaloAccess(minPermission: Permission) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;

    const params = request.params as Record<string, string>;
    let zaloAccountId = params.zaloAccountId || params.id;

    // If accessing via conversation, look up the Zalo account from the conversation
    if (params.id && !params.zaloAccountId) {
      try {
        const db = getTenantPrisma(user.orgId);
        const conv = await db.conversation.findFirst({
          where: { id: params.id, orgId: user.orgId },
          select: { zaloAccountId: true },
        });
        if (conv && conv.zaloAccountId) zaloAccountId = conv.zaloAccountId;
      } catch {
        return reply.status(500).send({ error: 'Internal error checking access' });
      }
    }

    if (!zaloAccountId) return reply.status(404).send({ error: 'Not found' });

    try {
      const db = getTenantPrisma(user.orgId);
      const account = await db.zaloAccount.findFirst({
        where: { id: zaloAccountId, ...getZaloAccountAccessWhere(user) },
        select: { id: true },
      });
      if (!account) {
        return reply.status(403).send({ error: 'Không có quyền truy cập tài khoản Zalo này' });
      }
    } catch {
      return reply.status(500).send({ error: 'Internal error checking access' });
    }
  };
}
