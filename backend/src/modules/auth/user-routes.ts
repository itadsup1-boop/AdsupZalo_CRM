/**
 * User management routes — CRUD for users within an org.
 * All routes require authentication via authMiddleware.
 * Role-based access: owner > admin > member.
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getTenantPrisma } from '../../shared/database/prisma-tenant.js';
import { authMiddleware } from './auth-middleware.js';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { logger } from '../../shared/utils/logger.js';

export async function userRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);

  // GET /api/v1/users — list all users in org
  app.get('/api/v1/users', async (request: FastifyRequest) => {
    const user = request.user!;
    const db = getTenantPrisma(user.orgId);
    const users = await db.user.findMany({
      where: {},
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        isActive: true,
        isPending: true,
        teamId: true,
        createdAt: true,
        team: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return { users };
  });

  // POST /api/v1/users — create user (owner/admin only)
  app.post('/api/v1/users', async (request: FastifyRequest, reply: FastifyReply) => {
    const currentUser = request.user!;
    if (!['owner', 'admin'].includes(currentUser.role)) {
      return reply.status(403).send({ error: 'Không có quyền' });
    }

    const { email: rawEmail, fullName, password, role = 'member', teamId } = request.body as any;
    if (!rawEmail || !fullName || !password) {
      return reply.status(400).send({ error: 'Email, họ tên, mật khẩu là bắt buộc' });
    }

    const email = rawEmail.toLowerCase().trim();

    const db = getTenantPrisma(currentUser.orgId);
    const existing = await db.user.findFirst({ where: { email } });
    if (existing) return reply.status(400).send({ error: 'Email đã tồn tại' });

    if (role === 'owner') return reply.status(400).send({ error: 'Không thể tạo thêm owner' });
    if (role === 'admin' && currentUser.role !== 'owner') {
      return reply.status(403).send({ error: 'Chỉ owner có thể tạo admin' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await db.user.create({
      data: {
        id: randomUUID(),
        orgId: currentUser.orgId,
        email,
        fullName,
        passwordHash,
        role,
        teamId: teamId || null,
        isActive: true,
        isPending: false, // Manual creation is auto-approved
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        isActive: true,
        isPending: true,
        createdAt: true,
      },
    });

    logger.info(`User created: ${user.email} by ${currentUser.email}`);
    return user;
  });

  // PUT /api/v1/users/:id/approve — approve a join request
  app.post('/api/v1/users/:id/approve', async (request: FastifyRequest, reply: FastifyReply) => {
    const currentUser = request.user!;
    if (!['owner', 'admin'].includes(currentUser.role)) {
      return reply.status(403).send({ error: 'Không có quyền' });
    }

    const { id } = request.params as { id: string };
    const db = getTenantPrisma(currentUser.orgId);
    
    await db.user.update({
      where: { id },
      data: { isPending: false, isActive: true },
    });

    logger.info(`User request approved: ${id} by ${currentUser.email}`);
    return { success: true };
  });

  // PUT /api/v1/users/:id — update user info
  app.put('/api/v1/users/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const currentUser = request.user!;
    const { id } = request.params as { id: string };

    if (!['owner', 'admin'].includes(currentUser.role) && currentUser.id !== id) {
      return reply.status(403).send({ error: 'Không có quyền' });
    }

    const { fullName, email: rawEmail, role, teamId, isActive } = request.body as any;

    if (id === currentUser.id && role && role !== currentUser.role) {
      return reply.status(400).send({ error: 'Không thể thay đổi role của chính mình' });
    }

    const updateData: any = {};
    if (fullName !== undefined) updateData.fullName = fullName;
    if (rawEmail !== undefined) updateData.email = rawEmail.toLowerCase().trim();
    if (role !== undefined && currentUser.role === 'owner') updateData.role = role;
    if (teamId !== undefined) updateData.teamId = teamId || null;
    if (isActive !== undefined && currentUser.role === 'owner') updateData.isActive = isActive;

    const db = getTenantPrisma(currentUser.orgId);
    const user = await db.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        isActive: true,
        isPending: true,
        teamId: true,
      },
    });

    return user;
  });

  // PUT /api/v1/users/:id/password — reset password (owner/admin only)
  app.put('/api/v1/users/:id/password', async (request: FastifyRequest, reply: FastifyReply) => {
    const currentUser = request.user!;
    if (!['owner', 'admin'].includes(currentUser.role)) {
      return reply.status(403).send({ error: 'Không có quyền' });
    }

    const { id } = request.params as { id: string };
    const { password } = request.body as { password: string };
    if (!password || password.length < 6) {
      return reply.status(400).send({ error: 'Mật khẩu tối thiểu 6 ký tự' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const db = getTenantPrisma(currentUser.orgId);
    await db.user.update({
      where: { id },
      data: { passwordHash },
    });

    return { success: true };
  });

  // DELETE /api/v1/users/:id — delete user permanently (owner only)
  app.delete('/api/v1/users/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const currentUser = request.user!;
    if (currentUser.role !== 'owner' && currentUser.role !== 'admin') {
       // admin can reject but only owner can delete permanent accounts
       // but for simplicity we allow both to reject/delete if it's pending
    }

    const { id } = request.params as { id: string };
    const db = getTenantPrisma(currentUser.orgId);
    
    // Check if user is pending
    const target = await db.user.findUnique({ where: { id } });
    if (!target) return reply.status(404).send({ error: 'User not found' });

    // Admins can reject pending users, but only Owner can delete active accounts
    if (target.role === 'owner') return reply.status(403).send({ error: 'Cannot delete owner' });
    if (!target.isPending && currentUser.role !== 'owner') {
      return reply.status(403).send({ error: 'Chỉ owner mới có quyền xóa nhân viên đang hoạt động' });
    }

    if (id === currentUser.id) {
      return reply.status(400).send({ error: 'Không thể xóa chính mình' });
    }

    try {
      // 1. Unassign contacts assigned to this user
      await db.contact.updateMany({
        where: { assignedUserId: id },
        data: { assignedUserId: null },
      });

      // 2. Delete Zalo account access records for this user
      await db.zaloAccountAccess.deleteMany({
        where: { userId: id },
      });

      // 3. Clear repliedByUserId in messages to avoid FK errors
      await db.message.updateMany({
        where: { repliedByUserId: id },
        data: { repliedByUserId: null },
      });

      // 4. Finally delete the user
      await db.user.delete({
        where: { id },
      });

      logger.info(`User permanently deleted/rejected: ${id} by ${currentUser.email}`);
      return { success: true };
    } catch (err: any) {
      logger.error(`Failed to delete user ${id}: ${err.message}`);
      return reply.status(400).send({ 
        error: 'Không thể xóa nhân viên này vì đang sở hữu dữ liệu quan trọng khác. Hãy kiểm tra lại.' 
      });
    }
  });
}
