/**
 * Zalo Socket.IO event handlers.
 * Manages room subscriptions for org-level and per-account events.
 */
import type { Server, Socket } from 'socket.io';
import { logger } from '../../shared/utils/logger.js';
import { canAccessZaloAccount } from '../../shared/utils/permission-scope.js';

export function registerZaloSocketHandlers(io: Server): void {
  io.on('connection', (socket: Socket) => {
    // Client should join org-level room (using verified orgId)
    socket.on('org:join', () => {
      const { orgId } = socket.data || {};
      if (!orgId) return;
      socket.join(`org_${orgId}`);
      socket.join(`org:${orgId}`);
      logger.debug(`Socket ${socket.id} joined org_${orgId}/org:${orgId}`);
    });

    // Subscribe to user-specific and branch-specific rooms safely
    socket.on('user:join', () => {
      const { userId, orgId, teamId, role } = socket.data || {};
      if (userId && orgId) {
        socket.join(`org_${orgId}`);
        socket.join(`org:${orgId}`);
        socket.join(`org_${orgId}_user_${userId}`);
        if (teamId) {
          socket.join(`org_${orgId}_branch_${teamId}`);
        }
        if (['owner', 'admin'].includes(role)) {
          socket.join(`org_${orgId}_admins`);
        }
        logger.debug(`Socket ${socket.id} joined scoped rooms for user ${userId}`);
      }
    });

    // Subscribe to QR/status updates for a Zalo account with strict access check
    socket.on('zalo:subscribe', async (data: { accountId: string }) => {
      if (!data?.accountId) return;
      const user = socket.data;
      if (!user) return;

      const hasAccess = await canAccessZaloAccount(user, data.accountId);
      if (hasAccess) {
        socket.join(`account:${data.accountId}`);
        logger.debug(`Socket ${socket.id} joined account:${data.accountId}`);
      } else {
        logger.warn(`[socket] Unauthorized zalo:subscribe from ${socket.id} for account ${data.accountId}`);
      }
    });

    // Unsubscribe from a specific account room
    socket.on('zalo:unsubscribe', (data: { accountId: string }) => {
      if (!data?.accountId) return;
      socket.leave(`account:${data.accountId}`);
      logger.debug(`Socket ${socket.id} left account:${data.accountId}`);
    });
  });
}
