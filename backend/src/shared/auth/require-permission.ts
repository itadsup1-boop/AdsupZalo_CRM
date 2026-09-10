import type { FastifyReply, FastifyRequest } from 'fastify';
import { hasPermission, normalizeRole, type Permission } from './permission-matrix.js';

export function requirePermission(permission: Permission) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    if (!hasPermission(normalizeRole(user.role), permission)) {
      return reply.status(403).send({ error: 'Không có quyền thực hiện thao tác này' });
    }
  };
}
