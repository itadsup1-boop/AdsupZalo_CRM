import { FastifyReply, FastifyRequest } from 'fastify';
import { logger } from '../utils/logger.js';

export type UserRole = 'owner' | 'admin' | 'manager' | 'staff' | 'viewer';

const ROLE_HIERARCHY: Record<UserRole, number> = {
  owner: 4,
  admin: 3,
  manager: 2,
  staff: 1,
  viewer: 0
};

/**
 * 6.3 Permission Engine: Kiểm tra quyền hạn tối thiểu
 */
export const requireRole = (minRole: UserRole) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as { role: UserRole; id: string; orgId: string };
    
    if (!user) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    if (ROLE_HIERARCHY[user.role] < ROLE_HIERARCHY[minRole]) {
      logger.warn(`[rbac] Access denied for ${user.id} (Role: ${user.role}, Required: ${minRole})`);
      return reply.status(403).send({ 
        error: 'Forbidden', 
        message: `Bạn cần quyền ${minRole} để thực hiện hành động này.` 
      });
    }
  };
};

/**
 * Đặc quyền cho Staff: Chỉ xem những chat được gán
 */
export const enforceStaffScope = async (request: FastifyRequest) => {
  const user = request.user as { role: UserRole; id: string };
  
  if (user.role === 'staff') {
    // Inject thêm filter vào query params hoặc body
    (request.query as any).assignedTo = user.id;
  }
};
