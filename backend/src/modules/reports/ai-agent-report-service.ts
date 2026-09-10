import { prisma } from '../../shared/database/prisma-client.js';
import { getContactAccessWhere } from '../../shared/utils/permission-scope.js';

export type ReportUser = { id: string; orgId: string; role: string; teamId?: string | null };
export type AiReportFilters = Record<string, string | undefined>;

export function parseDateRange(filters: AiReportFilters) {
  const to = filters.to ? new Date(filters.to) : new Date();
  const from = filters.from ? new Date(filters.from) : new Date(Date.now() - 30 * 86400000);
  to.setHours(23, 59, 59, 999);
  from.setHours(0, 0, 0, 0);
  return { from, to };
}

export function scopedContactWhere(user: ReportUser, filters: AiReportFilters) {
  const where: any = { ...getContactAccessWhere(user) };
  if (filters.teamId) where.teamId = filters.teamId;
  if (filters.assignedUserId) where.assignedUserId = filters.assignedUserId;
  if (filters.source) where.source = filters.source;
  if (filters.status) where.status = filters.status;
  return where;
}

export async function scopedContactIds(user: ReportUser, filters: AiReportFilters) {
  const contacts = await prisma.contact.findMany({
    where: scopedContactWhere(user, filters),
    select: { id: true },
    take: 10000,
  });
  return contacts.map((contact) => contact.id);
}

function pct(part: number, total: number) {
  return total > 0 ? Math.round((part / total) * 10000) / 100 : 0;
}

export async function aiAgentSummary(user: ReportUser, filters: AiReportFilters) {
  const { from, to } = parseDateRange(filters);
  const contactIds = await scopedContactIds(user, filters);
  if (contactIds.length === 0) {
    return {
      totalAiContacts: 0, aiMessagesSent: 0, respondedContacts: 0, noResponseContacts: 0,
      aiCreatedAppointmentContacts: 0, aiAppointments: 0, responseRate: 0, bookingRate: 0,
      aiErrors: 0, needStaffCases: 0, aiPausedByStaff: 0, aiToSaleContacts: 0,
    };
  }

  const baseLogWhere: any = { orgId: user.orgId, createdAt: { gte: from, lte: to }, contactId: { in: contactIds } };
  const [aiContactRows, aiMessagesSent, respondedRows, appointments, errorCount, needStaffCases, pausedCount, handoverCount] = await Promise.all([
    prisma.aiActivityLog.groupBy({ by: ['contactId'], where: baseLogWhere }),
    prisma.message.count({
      where: {
        orgId: user.orgId,
        senderType: 'self',
        senderName: { in: ['AI Agent', 'AI Booking', 'AI Follow-up', 'Appointment Reminder'] },
        sentAt: { gte: from, lte: to },
        conversation: { contactId: { in: contactIds } },
      },
    }),
    prisma.conversation.groupBy({
      by: ['contactId'],
      where: { orgId: user.orgId, contactId: { in: contactIds }, lastCustomerMessageAt: { gte: from, lte: to } },
    }),
    prisma.appointment.findMany({
      where: {
        orgId: user.orgId,
        contactId: { in: contactIds },
        createdBy: 'ai',
        createdAt: { gte: from, lte: to },
        ...(filters.appointmentStatus ? { status: filters.appointmentStatus } : {}),
        ...(filters.service ? { serviceName: { contains: filters.service, mode: 'insensitive' } } : {}),
      },
      select: { contactId: true },
    }),
    prisma.aiReviewItem.count({ where: { orgId: user.orgId, contactId: { in: contactIds }, createdAt: { gte: from, lte: to } } }),
    prisma.aiReviewItem.count({ where: { orgId: user.orgId, contactId: { in: contactIds }, createdAt: { gte: from, lte: to }, status: { in: ['open', 'reviewing'] } } }),
    prisma.aiActivityLog.count({ where: { ...baseLogWhere, actionType: { in: ['ai.paused_by_staff', 'ai.negative_feedback_detected'] } } }),
    prisma.contactAssignmentHistory.count({ where: { orgId: user.orgId, contactId: { in: contactIds }, assignedByType: { in: ['ai', 'system'] }, toUserId: { not: null }, createdAt: { gte: from, lte: to } } }),
  ]);

  const totalAiContacts = aiContactRows.filter((row) => row.contactId).length;
  const respondedContacts = respondedRows.filter((row) => row.contactId).length;
  const aiCreatedAppointmentContacts = new Set(appointments.map((app) => app.contactId)).size;
  return {
    totalAiContacts,
    aiMessagesSent,
    respondedContacts,
    noResponseContacts: Math.max(0, totalAiContacts - respondedContacts),
    aiCreatedAppointmentContacts,
    aiAppointments: appointments.length,
    responseRate: pct(respondedContacts, totalAiContacts),
    bookingRate: pct(aiCreatedAppointmentContacts, totalAiContacts),
    aiErrors: errorCount,
    needStaffCases,
    aiPausedByStaff: pausedCount,
    aiToSaleContacts: handoverCount,
    from: from.toISOString(),
    to: to.toISOString(),
  };
}

async function groupContactsBy(user: ReportUser, filters: AiReportFilters, field: 'teamId' | 'assignedUserId' | 'source') {
  const { from, to } = parseDateRange(filters);
  const where = scopedContactWhere(user, filters);
  const groups = await prisma.contact.groupBy({ by: [field], where, _count: true });
  const contactIds = await scopedContactIds(user, filters);
  const aiLogs = await prisma.aiActivityLog.groupBy({
    by: field === 'assignedUserId' ? ['assignedUserId'] : ['teamId'],
    where: { orgId: user.orgId, createdAt: { gte: from, lte: to }, contactId: { in: contactIds } },
    _count: true,
  });
  const map = new Map(aiLogs.map((row: any) => [row[field === 'assignedUserId' ? 'assignedUserId' : 'teamId'] || 'none', row._count]));
  return groups.map((group: any) => ({
    key: group[field] || 'Chưa có',
    totalContacts: group._count,
    aiActions: map.get(group[field] || 'none') || 0,
  }));
}

export async function aiAgentByBranch(user: ReportUser, filters: AiReportFilters) {
  const rows = await groupContactsBy(user, filters, 'teamId');
  const teams = await prisma.team.findMany({ where: { orgId: user.orgId }, select: { id: true, name: true } });
  const names = new Map(teams.map((team) => [team.id, team.name]));
  return rows.map((row) => ({ ...row, name: names.get(row.key) || row.key }));
}

export async function aiAgentBySale(user: ReportUser, filters: AiReportFilters) {
  const rows = await groupContactsBy(user, filters, 'assignedUserId');
  const users = await prisma.user.findMany({ where: { orgId: user.orgId }, select: { id: true, fullName: true } });
  const names = new Map(users.map((sale) => [sale.id, sale.fullName]));
  return rows.map((row) => ({ ...row, name: names.get(row.key) || row.key }));
}

export async function aiAgentBySource(user: ReportUser, filters: AiReportFilters) {
  return groupContactsBy(user, filters, 'source');
}

export async function aiAgentByService(user: ReportUser, filters: AiReportFilters) {
  const contactIds = await scopedContactIds(user, filters);
  if (contactIds.length === 0) return [];
  const rows = await prisma.appointment.groupBy({
    by: ['serviceName'],
    where: { orgId: user.orgId, contactId: { in: contactIds }, createdBy: 'ai' },
    _count: true,
  });
  return rows.map((row) => ({ key: row.serviceName || 'Chưa có', name: row.serviceName || 'Chưa có', aiAppointments: row._count }));
}

export async function aiAgentErrors(user: ReportUser, filters: AiReportFilters) {
  const { from, to } = parseDateRange(filters);
  const contactIds = await scopedContactIds(user, filters);
  if (contactIds.length === 0) return [];
  return prisma.aiReviewItem.findMany({
    where: {
      orgId: user.orgId,
      contactId: { in: contactIds },
      createdAt: { gte: from, lte: to },
      ...(filters.issueType ? { issueType: filters.issueType } : {}),
      ...(filters.severity ? { severity: filters.severity } : {}),
      ...(filters.reviewStatus ? { status: filters.reviewStatus } : {}),
    },
    include: { contact: { select: { fullName: true, crmName: true, phone: true } } },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });
}
