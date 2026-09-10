import { prisma } from '../../shared/database/prisma-client.js';
import { createAppointment } from './appointment-service.js';
import { logAiActivity } from '../ai/ai-audit-service.js';

type BookingDraft = {
  customerName?: string;
  phone?: string;
  serviceName?: string;
  branchId?: string;
  appointmentDate?: string;
  note?: string;
  awaitingConfirmation?: boolean;
};

const REQUIRED_FIELDS: Array<keyof BookingDraft> = ['customerName', 'phone', 'serviceName', 'branchId', 'appointmentDate'];

function isBookingIntent(text: string) {
  return /(đặt|book|hẹn|lịch|qua cơ sở|tư vấn trực tiếp|khám|đến làm)/i.test(text);
}

function isConfirm(text: string) {
  return /^(ok|oki|đồng ý|xác nhận|chốt|dạ đúng|đúng rồi|vâng|yes)\b/i.test(text.trim());
}

function isReject(text: string) {
  return /(không|chưa|đổi|sai|hủy|huỷ)/i.test(text);
}

function extractPhone(text: string) {
  const match = text.match(/(?:\+?84|0)(?:[\s.-]?\d){9,10}/);
  return match?.[0]?.replace(/[^\d+]/g, '');
}

function extractName(text: string) {
  const match = text.match(/(?:em|mình|tôi|anh|chị)\s+(?:là|tên là|tên)\s+([a-zA-ZÀ-ỹ\s]{2,40})/i);
  return match?.[1]?.trim();
}

function nextVietnamDate(days: number, hour = 9, minute = 0) {
  const now = new Date();
  const vietnam = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
  vietnam.setDate(vietnam.getDate() + days);
  vietnam.setHours(hour, minute, 0, 0);
  return vietnam;
}

function extractAppointmentDate(text: string) {
  const lower = text.toLowerCase();
  const hourMatch = lower.match(/(?:lúc|tầm|khoảng)?\s*(\d{1,2})(?:h|:)(\d{2})?/);
  const hour = hourMatch ? Number(hourMatch[1]) : lower.includes('chiều') ? 15 : lower.includes('sáng') ? 9 : null;
  const minute = hourMatch?.[2] ? Number(hourMatch[2]) : 0;

  if (lower.includes('ngày mai') || lower.includes('mai')) return nextVietnamDate(1, hour ?? 9, minute).toISOString();
  if (lower.includes('chiều mai')) return nextVietnamDate(1, hour ?? 15, minute).toISOString();
  if (lower.includes('cuối tuần') || lower.includes('cuoi tuan')) return undefined;

  const dateMatch = lower.match(/(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?/);
  if (dateMatch) {
    const day = Number(dateMatch[1]);
    const month = Number(dateMatch[2]) - 1;
    const year = dateMatch[3] ? Number(dateMatch[3].length === 2 ? `20${dateMatch[3]}` : dateMatch[3]) : new Date().getFullYear();
    const parsed = new Date(year, month, day, hour ?? 9, minute, 0, 0);
    return parsed.toISOString();
  }

  if (hour !== null && /(hôm nay|nay)/i.test(lower)) return nextVietnamDate(0, hour, minute).toISOString();
  if (hour !== null) return undefined;
  return undefined;
}

async function loadDraft(orgId: string, conversationId: string): Promise<BookingDraft> {
  const setting = await prisma.appSetting.findUnique({ where: { orgId_settingKey: { orgId, settingKey: `booking_flow:${conversationId}` } } });
  if (!setting?.valuePlain) return {};
  try {
    return JSON.parse(setting.valuePlain) as BookingDraft;
  } catch {
    return {};
  }
}

async function saveDraft(orgId: string, conversationId: string, draft: BookingDraft) {
  await prisma.appSetting.upsert({
    where: { orgId_settingKey: { orgId, settingKey: `booking_flow:${conversationId}` } },
    update: { valuePlain: JSON.stringify(draft) },
    create: { orgId, settingKey: `booking_flow:${conversationId}`, valuePlain: JSON.stringify(draft) },
  });
}

async function clearDraft(orgId: string, conversationId: string) {
  await prisma.appSetting.deleteMany({ where: { orgId, settingKey: `booking_flow:${conversationId}` } });
}

async function enrichDraft(orgId: string, draft: BookingDraft, text: string) {
  const phone = extractPhone(text);
  const name = extractName(text);
  const appointmentDate = extractAppointmentDate(text);
  if (phone) draft.phone = phone;
  if (name) draft.customerName = name;
  if (appointmentDate) draft.appointmentDate = appointmentDate;

  const products = await prisma.product.findMany({ where: { orgId, isActive: true }, select: { name: true }, take: 100 });
  const product = products.find((item) => text.toLowerCase().includes(item.name.toLowerCase()));
  if (product) draft.serviceName = product.name;

  const teams = await prisma.team.findMany({ where: { orgId }, select: { id: true, name: true }, take: 100 });
  const team = teams.find((item) => text.toLowerCase().includes(item.name.toLowerCase()));
  if (team) draft.branchId = team.id;

  const noteMatch = text.match(/(?:ghi chú|note|lưu ý)[:\s]+(.{2,120})/i);
  if (noteMatch) draft.note = noteMatch[1].trim();

  return { draft, teams };
}

function missingQuestion(field: keyof BookingDraft) {
  switch (field) {
    case 'customerName': return 'Dạ chị/anh cho em xin tên khách hàng để đặt lịch ạ.';
    case 'phone': return 'Dạ chị/anh cho em xin số điện thoại để bên em giữ lịch ạ.';
    case 'serviceName': return 'Chị/anh muốn đặt lịch cho dịch vụ nào ạ?';
    case 'branchId': return 'Chị/anh muốn đến cơ sở nào ạ?';
    case 'appointmentDate': return 'Chị/anh muốn đặt lịch vào ngày giờ cụ thể nào ạ? Nếu là “chiều mai” hay “cuối tuần”, chị/anh cho em xin khung giờ cụ thể giúp em nhé.';
    default: return 'Chị/anh bổ sung giúp em thông tin còn thiếu ạ.';
  }
}

function confirmationText(draft: BookingDraft, branchName: string | null) {
  const time = draft.appointmentDate
    ? new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' }).format(new Date(draft.appointmentDate))
    : '';
  return `Em xác nhận lịch của chị/anh: ${draft.customerName} - ${draft.phone} - ${draft.serviceName} - ${branchName || draft.branchId} - ${time}. Mình xác nhận giúp em nhé ạ?`;
}

export async function processAiBookingMessage(input: {
  orgId: string;
  conversationId: string;
  contactId?: string | null;
  text: string;
  assignedUserId?: string | null;
  source?: string;
}) {
  let draft = await loadDraft(input.orgId, input.conversationId);
  if (!isBookingIntent(input.text) && Object.keys(draft).length === 0) {
    return { handled: false };
  }

  const enriched = await enrichDraft(input.orgId, draft, input.text);
  draft = enriched.draft;

  if (draft.awaitingConfirmation) {
    if (isConfirm(input.text)) {
      const user = { id: input.assignedUserId || 'ai', orgId: input.orgId, role: 'admin' };
      const appointment = await createAppointment(user, {
        contactId: input.contactId || undefined,
        conversationId: input.conversationId,
        customerName: draft.customerName,
        phone: draft.phone,
        serviceName: draft.serviceName,
        branchId: draft.branchId,
        appointmentDate: draft.appointmentDate,
        note: draft.note,
        createdBy: 'ai',
        source: input.source || 'zalo',
        assignedUserId: input.assignedUserId || null,
      });
      await logAiActivity({
        orgId: input.orgId,
        contactId: input.contactId || null,
        conversationId: input.conversationId,
        actorType: 'ai',
        actionType: 'ai.appointment_created',
        inputMessage: input.text,
        outputMessage: 'Đã tạo lịch hẹn sau khi khách xác nhận',
        appointmentId: appointment.id,
        assignedUserId: appointment.assignedUserId,
        confidence: 0.95,
        metadata: { bookingDraft: draft },
      });
      await clearDraft(input.orgId, input.conversationId);
      return { handled: true, appointment, reply: 'Dạ em đã tạo lịch hẹn cho mình trong hệ thống rồi ạ. Em sẽ nhắc lịch trước giờ hẹn giúp chị/anh nhé.' };
    }
    if (isReject(input.text)) {
      draft.awaitingConfirmation = false;
      await saveDraft(input.orgId, input.conversationId, draft);
      return { handled: true, reply: 'Dạ mình muốn đổi thông tin nào ạ? Chị/anh nhắn lại giúp em tên, SĐT, dịch vụ, cơ sở hoặc ngày giờ cần chỉnh nhé.' };
    }
  }

  const missing = REQUIRED_FIELDS.find((field) => !draft[field]);
  if (missing) {
    await saveDraft(input.orgId, input.conversationId, draft);
    await prisma.activityLog.create({
      data: {
        orgId: input.orgId,
        action: 'ai.booking.collect',
        entityType: 'conversation',
        entityId: input.conversationId,
        details: { missingField: missing },
      },
    });
    return { handled: true, reply: missingQuestion(missing) };
  }

  const branch = enriched.teams.find((team) => team.id === draft.branchId);
  draft.awaitingConfirmation = true;
  await saveDraft(input.orgId, input.conversationId, draft);
  await prisma.activityLog.create({
    data: {
      orgId: input.orgId,
      action: 'ai.booking.confirmation_requested',
      entityType: 'conversation',
      entityId: input.conversationId,
      details: draft,
    },
  });
  return { handled: true, reply: confirmationText(draft, branch?.name || null) };
}
