import type { Server } from 'socket.io';
import { Prisma } from '@prisma/client';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { createAppointmentNotification } from './notification-service.js';

export const ACTIVE_APPOINTMENT_STATUSES = ['new', 'confirmed', 'arrived', 'rescheduled'];
export const APPOINTMENT_STATUSES = [...ACTIVE_APPOINTMENT_STATUSES, 'completed', 'cancelled', 'no_show'];
const SOURCES = ['zalo', 'facebook', 'manual', 'other'];
const CREATED_BY = ['ai', 'staff'];

export interface AppointmentInput {
  contactId?: string;
  conversationId?: string | null;
  customerName?: string | null;
  phone?: string | null;
  serviceName?: string | null;
  serviceId?: string | null;
  branchId?: string | null;
  appointmentDate?: string | Date;
  appointmentTime?: string | null;
  note?: string | null;
  notes?: string | null;
  status?: string;
  assignedUserId?: string | null;
  createdBy?: string;
  source?: string;
  type?: string | null;
}

export interface ScopedUser {
  id: string;
  orgId: string;
  role: string;
  teamId?: string | null;
}

export function normalizePhone(phone: string | null | undefined) {
  if (!phone) return '';
  const cleaned = phone.replace(/[^\d+]/g, '');
  if (cleaned.startsWith('+84')) return `0${cleaned.slice(3)}`;
  if (cleaned.startsWith('84') && cleaned.length >= 11) return `0${cleaned.slice(2)}`;
  return cleaned;
}

export function isValidVietnamPhone(phone: string) {
  return /^0(3|5|7|8|9)\d{8}$/.test(phone);
}

export function parseAppointmentDate(input: string | Date | undefined) {
  if (!input) return null;
  const value = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(value.getTime())) return null;
  return value;
}

export function deriveTimeLabel(value: Date) {
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(value);
}

async function logAppointmentAction(input: {
  orgId: string;
  userId?: string | null;
  action: string;
  appointmentId?: string;
  details?: Record<string, unknown>;
}) {
  await prisma.activityLog.create({
    data: {
      orgId: input.orgId,
      userId: input.userId || null,
      action: input.action,
      entityType: 'appointment',
      entityId: input.appointmentId,
      details: (input.details || {}) as Prisma.InputJsonObject,
    },
  });
}

async function resolveContact(orgId: string, data: AppointmentInput) {
  if (data.contactId) {
    return prisma.contact.findFirst({ where: { orgId, id: data.contactId } });
  }

  const phone = normalizePhone(data.phone);
  if (!phone) return null;

  const existing = await prisma.contact.findFirst({ where: { orgId, phone } });
  if (existing) return existing;

  return prisma.contact.create({
    data: {
      orgId,
      phone,
      fullName: data.customerName || phone,
      crmName: data.customerName || phone,
      source: data.source || 'manual',
      teamId: data.branchId || null,
      assignedUserId: data.assignedUserId || null,
      nextAppointment: parseAppointmentDate(data.appointmentDate) || undefined,
    },
  });
}

async function validateBranch(orgId: string, branchId: string | null | undefined) {
  if (!branchId) return null;
  const branch = await prisma.team.findFirst({ where: { orgId, id: branchId } });
  if (!branch) throw new Error('Cơ sở không hợp lệ');
  return branch;
}

async function validateService(orgId: string, serviceId: string | null | undefined, serviceName: string | null | undefined) {
  if (serviceId) {
    const product = await prisma.product.findFirst({ where: { orgId, id: serviceId, isActive: true } });
    if (!product) throw new Error('Dịch vụ không hợp lệ');
    return { id: product.id, name: product.name };
  }

  if (!serviceName) throw new Error('Dịch vụ là bắt buộc');
  const productCount = await prisma.product.count({ where: { orgId, isActive: true } });
  if (productCount === 0) return { id: null, name: serviceName };

  const product = await prisma.product.findFirst({
    where: { orgId, isActive: true, name: { equals: serviceName, mode: 'insensitive' } },
  });
  if (!product) throw new Error('Dịch vụ không có trong danh sách cấu hình');
  return { id: product.id, name: product.name };
}

export async function createAppointment(user: ScopedUser, data: AppointmentInput, io?: Server) {
  const appointmentDate = parseAppointmentDate(data.appointmentDate);
  if (!appointmentDate) throw new Error('Ngày giờ hẹn không hợp lệ');
  if (appointmentDate.getTime() < Date.now() - 60_000) throw new Error('Không thể tạo lịch hẹn trong quá khứ');

  const contact = await resolveContact(user.orgId, data);
  if (!contact) throw new Error('Khách hàng là bắt buộc');

  const phone = normalizePhone(data.phone || contact.phone);
  if (!isValidVietnamPhone(phone)) throw new Error('Số điện thoại không hợp lệ');

  const branch = await validateBranch(user.orgId, data.branchId || contact.teamId);
  const service = await validateService(user.orgId, data.serviceId || null, data.serviceName || data.type || null);
  const status = data.status || (data.createdBy === 'ai' ? 'confirmed' : 'new');
  if (!APPOINTMENT_STATUSES.includes(status)) throw new Error('Trạng thái lịch hẹn không hợp lệ');
  const source = data.source && SOURCES.includes(data.source) ? data.source : 'manual';
  const createdBy = data.createdBy && CREATED_BY.includes(data.createdBy) ? data.createdBy : 'staff';

  const duplicate = await prisma.appointment.findFirst({
    where: {
      orgId: user.orgId,
      phone,
      serviceName: service.name,
      branchId: branch?.id || null,
      appointmentDate,
      status: { in: ACTIVE_APPOINTMENT_STATUSES },
    },
  });
  if (duplicate) {
    const err = new Error('Khách đã có lịch hẹn tương tự') as Error & { code?: string; appointmentId?: string };
    err.code = 'DUPLICATE_APPOINTMENT';
    err.appointmentId = duplicate.id;
    throw err;
  }

  const appointment = await prisma.appointment.create({
    data: {
      orgId: user.orgId,
      contactId: contact.id,
      conversationId: data.conversationId || null,
      customerName: data.customerName || contact.fullName || contact.crmName || phone,
      phone,
      serviceName: service.name,
      serviceId: service.id,
      branchId: branch?.id || null,
      assignedUserId: data.assignedUserId || contact.assignedUserId || (createdBy === 'staff' ? user.id : null),
      appointmentDate,
      appointmentTime: data.appointmentTime || deriveTimeLabel(appointmentDate),
      type: data.type || service.name,
      status,
      notes: data.notes || data.note || null,
      note: data.note || data.notes || null,
      source,
      createdBy,
    },
    include: appointmentInclude,
  });

  await prisma.contact.update({
    where: { orgId_id: { orgId: user.orgId, id: contact.id } },
    data: {
      nextAppointment: appointmentDate,
      teamId: branch?.id || contact.teamId,
      assignedUserId: data.assignedUserId || contact.assignedUserId || (createdBy === 'staff' ? user.id : null),
      lastActivity: new Date(),
    },
  });

  await logAppointmentAction({
    orgId: user.orgId,
    userId: createdBy === 'staff' ? user.id : null,
    action: 'appointment.create',
    appointmentId: appointment.id,
    details: { createdBy, source, conversationId: data.conversationId || null },
  });
  await createAppointmentNotification(io, {
    id: appointment.id,
    orgId: user.orgId,
    customerName: appointment.customerName,
    phone: appointment.phone,
    serviceName: appointment.serviceName,
    branchId: appointment.branchId,
    branchName: appointment.branch?.name,
    appointmentDate: appointment.appointmentDate,
    assignedUserId: appointment.assignedUserId,
  });

  return appointment;
}

export const appointmentInclude = {
  contact: { select: { id: true, fullName: true, crmName: true, phone: true, avatarUrl: true, teamId: true } },
  assignedUser: { select: { id: true, fullName: true } },
  branch: { select: { id: true, name: true } },
  conversation: { select: { id: true } },
} as const;

export async function updateAppointment(user: ScopedUser, id: string, data: AppointmentInput) {
  const existing = await prisma.appointment.findFirst({
    where: { orgId: user.orgId, id },
    include: { contact: true },
  });
  if (!existing) throw new Error('Appointment not found');

  const parsedAppointmentDate = data.appointmentDate ? parseAppointmentDate(data.appointmentDate) : undefined;
  const appointmentDate = parsedAppointmentDate || undefined;
  if (data.appointmentDate && !appointmentDate) throw new Error('Ngày giờ hẹn không hợp lệ');

  const branch = data.branchId !== undefined ? await validateBranch(user.orgId, data.branchId) : undefined;
  const service = data.serviceId !== undefined || data.serviceName !== undefined
    ? await validateService(user.orgId, data.serviceId || null, data.serviceName || existing.serviceName || existing.type)
    : undefined;
  const phone = data.phone !== undefined ? normalizePhone(data.phone) : undefined;
  if (phone !== undefined && !isValidVietnamPhone(phone)) throw new Error('Số điện thoại không hợp lệ');
  if (data.status && !APPOINTMENT_STATUSES.includes(data.status)) throw new Error('Trạng thái lịch hẹn không hợp lệ');

  const updated = await prisma.appointment.update({
    where: { orgId_id: { orgId: user.orgId, id } },
    data: {
      customerName: data.customerName ?? undefined,
      phone,
      serviceName: service?.name,
      serviceId: service?.id,
      branchId: branch === undefined ? undefined : branch?.id || null,
      assignedUserId: data.assignedUserId,
      appointmentDate,
      appointmentTime: appointmentDate ? deriveTimeLabel(appointmentDate) : data.appointmentTime ?? undefined,
      status: data.status,
      notes: data.notes ?? data.note ?? undefined,
      note: data.note ?? data.notes ?? undefined,
      source: data.source,
      type: data.type,
    },
    include: appointmentInclude,
  });

  const action = data.status === 'cancelled'
    ? 'appointment.cancel'
    : appointmentDate && appointmentDate.getTime() !== existing.appointmentDate.getTime()
      ? 'appointment.reschedule'
      : 'appointment.update';
  await logAppointmentAction({
    orgId: user.orgId,
    userId: user.id,
    action,
    appointmentId: id,
    details: { beforeStatus: existing.status, afterStatus: updated.status },
  });

  return updated;
}

export async function cancelAppointment(user: ScopedUser, id: string, reason?: string) {
  return updateAppointment(user, id, { status: 'cancelled', note: reason || undefined });
}

export async function listAppointments(user: ScopedUser, query: Record<string, string>) {
  const page = Math.max(parseInt(query.page || '1', 10), 1);
  const limit = Math.min(Math.max(parseInt(query.limit || '50', 10), 1), 200);
  const where: any = { orgId: user.orgId };

  if (!['owner', 'admin'].includes(user.role)) {
    where.OR = [
      { assignedUserId: user.id },
      ...(user.teamId ? [{ branchId: user.teamId }, { contact: { teamId: user.teamId } }] : []),
    ];
  }
  if (query.status) where.status = query.status;
  if (query.contactId) where.contactId = query.contactId;
  if (query.branchId) where.branchId = query.branchId;
  if (query.service) where.serviceName = { contains: query.service, mode: 'insensitive' };
  if (query.q) {
    where.OR = [
      ...(where.OR || []),
      { customerName: { contains: query.q, mode: 'insensitive' } },
      { phone: { contains: normalizePhone(query.q) || query.q } },
      { serviceName: { contains: query.q, mode: 'insensitive' } },
      { contact: { fullName: { contains: query.q, mode: 'insensitive' } } },
    ];
  }
  if (query.dateFrom || query.dateTo) {
    where.appointmentDate = {};
    if (query.dateFrom) where.appointmentDate.gte = new Date(query.dateFrom);
    if (query.dateTo) where.appointmentDate.lte = new Date(query.dateTo);
  }

  const [appointments, total] = await Promise.all([
    prisma.appointment.findMany({
      where,
      include: appointmentInclude,
      orderBy: [{ appointmentDate: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.appointment.count({ where }),
  ]);

  return { appointments, total, page, limit };
}

export async function getAppointment(user: ScopedUser, id: string) {
  const appointment = await prisma.appointment.findFirst({
    where: { orgId: user.orgId, id },
    include: appointmentInclude,
  });
  if (!appointment) throw new Error('Appointment not found');
  return appointment;
}

export async function logAppointmentError(orgId: string, action: string, err: unknown, details?: Record<string, unknown>) {
  logger.error(`[appointments] ${action}:`, err);
  await prisma.activityLog.create({
    data: {
      orgId,
      action,
      entityType: 'appointment',
      details: { error: err instanceof Error ? err.message : String(err), ...(details || {}) },
    },
  }).catch((logErr) => logger.error('[appointments] Failed to write error log:', logErr));
}
