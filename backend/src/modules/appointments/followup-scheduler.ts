import cron from 'node-cron';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { sendConversationText } from './customer-message-service.js';

const FOLLOWUP_DELAYS_MS = [30 * 60 * 1000, 3 * 60 * 60 * 1000, 24 * 60 * 60 * 1000];

function followupText(step: number, serviceName?: string | null) {
  if (step === 1) {
    return `Em thấy chị/anh đang quan tâm ${serviceName || 'dịch vụ bên em'}, em có thể tư vấn thêm giúp mình phần chi phí và thời gian thực hiện ạ.`;
  }
  if (step === 2) {
    return 'Chị/anh muốn em kiểm tra giúp lịch trống gần nhất tại cơ sở phù hợp không ạ?';
  }
  return 'Em gửi lại thông tin để chị/anh tiện xem. Khi nào cần tư vấn thêm, mình nhắn em hỗ trợ ngay ạ.';
}

async function isFollowupEnabled(orgId: string, teamId: string | null) {
  return false; // Tạm thời tắt tính năng tự động trả lời theo yêu cầu
}

async function runFollowupPass() {
  const now = new Date();
  const conversations = await prisma.conversation.findMany({
    where: {
      aiPaused: false,
      followupCount: { lt: 3 },
      lastCustomerMessageAt: { not: null },
      appointments: {
        none: { status: { in: ['new', 'confirmed', 'arrived', 'rescheduled'] } },
      },
    },
    include: {
      contact: {
        include: {
          customerProducts: { include: { product: true }, take: 1 },
        },
      },
    },
    take: 100,
  });

  for (const conversation of conversations) {
    if (!conversation.lastCustomerMessageAt) continue;
    if (conversation.lastStaffMessageAt && conversation.lastStaffMessageAt >= conversation.lastCustomerMessageAt) continue;
    if (!(await isFollowupEnabled(conversation.orgId, conversation.teamId))) continue;

    const nextStep = conversation.followupCount + 1;
    const dueAt = new Date(conversation.lastCustomerMessageAt.getTime() + FOLLOWUP_DELAYS_MS[conversation.followupCount]);
    if (dueAt > now) continue;
    if (conversation.lastFollowupAt && now.getTime() - conversation.lastFollowupAt.getTime() < 25 * 60 * 1000) continue;

    try {
      const serviceName = conversation.contact?.customerProducts?.[0]?.product?.name;
      await sendConversationText({
        orgId: conversation.orgId,
        conversationId: conversation.id,
        content: followupText(nextStep, serviceName),
        senderName: 'AI Follow-up',
      });

      await prisma.conversation.update({
        where: { orgId_id: { orgId: conversation.orgId, id: conversation.id } },
        data: {
          followupCount: { increment: 1 },
          lastFollowupAt: new Date(),
          lastStaffMessageAt: new Date(),
          isReplied: true,
        },
      });
      await prisma.activityLog.create({
        data: {
          orgId: conversation.orgId,
          action: 'conversation.followup.sent',
          entityType: 'conversation',
          entityId: conversation.id,
          details: { step: nextStep },
        },
      });
    } catch (err) {
      logger.error(`[followup] Failed to send follow-up for conversation ${conversation.id}:`, err);
      await prisma.activityLog.create({
        data: {
          orgId: conversation.orgId,
          action: 'conversation.followup.error',
          entityType: 'conversation',
          entityId: conversation.id,
          details: { error: err instanceof Error ? err.message : String(err), step: nextStep },
        },
      });
    }
  }
}

export function startFollowupScheduler() {
  cron.schedule('*/5 * * * *', async () => {
    try {
      await runFollowupPass();
    } catch (err) {
      logger.error('[followup] Cron job error:', err);
    }
  }, { timezone: 'Asia/Ho_Chi_Minh' });

  logger.info('[followup] Silent customer follow-up cron started (every 5 minutes, Asia/Ho_Chi_Minh)');
}
