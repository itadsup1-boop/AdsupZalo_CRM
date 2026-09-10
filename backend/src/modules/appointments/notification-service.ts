import type { Server } from 'socket.io';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';

export interface AppointmentNotificationInput {
  id: string;
  orgId: string;
  customerName: string | null;
  phone: string | null;
  serviceName: string | null;
  branchId: string | null;
  branchName?: string | null;
  appointmentDate: Date;
  assignedUserId?: string | null;
}

function formatVietnamTime(value: Date) {
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(value);
}

export async function createAppointmentNotification(io: Server | undefined, appointment: AppointmentNotificationInput) {
  const users = await prisma.user.findMany({
    where: {
      orgId: appointment.orgId,
      isActive: true,
      OR: [
        { role: { in: ['owner', 'admin'] } },
        ...(appointment.branchId ? [{ teamId: appointment.branchId }] : []),
        ...(appointment.assignedUserId ? [{ id: appointment.assignedUserId }] : []),
      ],
    },
    select: { id: true, teamId: true, role: true },
  });

  const title = 'Có lịch hẹn mới';
  const detail = `Có lịch hẹn mới: ${appointment.customerName || 'Khách hàng'} - ${appointment.phone || 'Chưa có SĐT'} - ${appointment.serviceName || 'Dịch vụ'} - ${appointment.branchName || appointment.branchId || 'Chưa chọn cơ sở'} - ${formatVietnamTime(appointment.appointmentDate)}`;

  const dedupedUserIds = Array.from(new Set(users.map((user) => user.id)));
  if (dedupedUserIds.length > 0) {
    await prisma.notification.createMany({
      data: dedupedUserIds.map((userId) => ({
        orgId: appointment.orgId,
        userId,
        teamId: appointment.branchId,
        type: 'appointment_new',
        title,
        detail,
        priority: 'high',
        entityType: 'appointment',
        entityId: appointment.id,
      })),
    });
  }

  const payload = {
    id: appointment.id,
    type: 'appointment_new',
    title,
    detail,
    appointment,
    createdAt: new Date().toISOString(),
  };

  if (io) {
    io.to(`org_${appointment.orgId}_admins`).emit('notification:new', payload);
    if (appointment.branchId) io.to(`org_${appointment.orgId}_branch_${appointment.branchId}`).emit('notification:new', payload);
    if (appointment.assignedUserId) io.to(`org_${appointment.orgId}_user_${appointment.assignedUserId}`).emit('notification:new', payload);
    io.to(`org_${appointment.orgId}_admins`).emit('appointment:new', payload);
    if (appointment.branchId) io.to(`org_${appointment.orgId}_branch_${appointment.branchId}`).emit('appointment:new', payload);
    if (appointment.assignedUserId) io.to(`org_${appointment.orgId}_user_${appointment.assignedUserId}`).emit('appointment:new', payload);
  }

  logger.info(`[appointments] Notification created for appointment ${appointment.id}`);
}
