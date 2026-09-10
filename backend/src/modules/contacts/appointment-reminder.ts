import cron from 'node-cron';
import type { Server } from 'socket.io';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { sendConversationText } from '../appointments/customer-message-service.js';

const ACTIVE_STATUSES = ['new', 'confirmed', 'rescheduled'];

function formatVietnamTime(value: Date) {
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(value);
}

function reminderText(appointment: {
  customerName: string | null;
  serviceName: string | null;
  appointmentDate: Date;
  branch: { name: string } | null;
}) {
  return `Em chào chị/anh ${appointment.customerName || 'mình'}, em nhắc lại lịch hẹn ${appointment.serviceName || 'dịch vụ'} tại ${appointment.branch?.name || 'cơ sở đã chọn'} vào lúc ${formatVietnamTime(appointment.appointmentDate)}. Chị/anh xác nhận giúp em mình vẫn đến đúng lịch nhé ạ. Nếu cần đổi lịch, mình nhắn lại giúp em ạ.`;
}

async function hasRecentFailure(appointmentId: string, milestone: '24h' | '2h') {
  const recent = new Date(Date.now() - 30 * 60 * 1000);
  const count = await prisma.activityLog.count({
    where: {
      entityType: 'appointment',
      entityId: appointmentId,
      action: 'appointment.reminder.error',
      createdAt: { gte: recent },
      details: { path: ['milestone'], equals: milestone },
    },
  });
  return count > 0;
}

async function processReminderMilestone(milestone: '24h' | '2h', windowStartMs: number, windowEndMs: number) {
  const now = Date.now();
  const start = new Date(now + windowStartMs);
  const end = new Date(now + windowEndMs);
  const sentField = milestone === '24h' ? 'reminder24hSentAt' : 'reminder2hSentAt';

  const appointments = await prisma.appointment.findMany({
    where: {
      appointmentDate: { gte: start, lte: end },
      status: { in: ACTIVE_STATUSES },
      [sentField]: null,
      conversationId: { not: null },
    },
    include: { branch: { select: { name: true } } },
    take: 100,
  });

  for (const appointment of appointments) {
    if (!appointment.conversationId) continue;
    if (await hasRecentFailure(appointment.id, milestone)) continue;

    try {
      const content = reminderText(appointment);
      await sendConversationText({
        orgId: appointment.orgId,
        conversationId: appointment.conversationId,
        content,
        senderName: 'Appointment Reminder',
      });

      await prisma.appointment.update({
        where: { orgId_id: { orgId: appointment.orgId, id: appointment.id } },
        data: { [sentField]: new Date(), reminderSent: milestone === '24h' ? true : appointment.reminderSent },
      });
      await prisma.activityLog.create({
        data: {
          orgId: appointment.orgId,
          action: 'appointment.reminder.sent',
          entityType: 'appointment',
          entityId: appointment.id,
          details: { milestone, conversationId: appointment.conversationId },
        },
      });
    } catch (err) {
      logger.error(`[reminder] Failed to send ${milestone} reminder for appointment ${appointment.id}:`, err);
      await prisma.activityLog.create({
        data: {
          orgId: appointment.orgId,
          action: 'appointment.reminder.error',
          entityType: 'appointment',
          entityId: appointment.id,
          details: { milestone, error: err instanceof Error ? err.message : String(err) },
        },
      });
    }
  }
}

export function startAppointmentReminder(_io: Server): void {
  cron.schedule('*/5 * * * *', async () => {
    try {
      await processReminderMilestone('24h', 23.75 * 60 * 60 * 1000, 24.25 * 60 * 60 * 1000);
      await processReminderMilestone('2h', 1.75 * 60 * 60 * 1000, 2.25 * 60 * 60 * 1000);
    } catch (err) {
      logger.error('[reminder] Cron job error:', err);
    }
  }, { timezone: 'Asia/Ho_Chi_Minh' });

  logger.info('[reminder] Appointment reminder cron started (every 5 minutes, Asia/Ho_Chi_Minh)');
}
