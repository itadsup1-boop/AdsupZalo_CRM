import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import ExcelJS from 'exceljs';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { requirePermission } from '../../shared/auth/require-permission.js';
import { getAppointmentAccessWhere, getContactAccessWhere } from '../../shared/utils/permission-scope.js';
import {
  aiAgentByBranch,
  aiAgentBySale,
  aiAgentByService,
  aiAgentBySource,
  aiAgentErrors,
  aiAgentSummary,
  parseDateRange,
  scopedContactWhere,
} from './ai-agent-report-service.js';
import { addSheet, excelBuffer, vietnamDate, yyyymmdd } from './excel-export-service.js';

type QueryParams = Record<string, string>;

function sendWorkbook(reply: FastifyReply, filename: string, workbook: ExcelJS.Workbook) {
  return excelBuffer(workbook).then((buffer) => {
    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    reply.header('Content-Disposition', `attachment; filename=${filename}`);
    return reply.send(buffer);
  });
}

export async function aiAgentReportRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);

  const reportPrefix = ['/api/v1/reports/ai-agent', '/api/reports/ai-agent'];
  for (const prefix of reportPrefix) {
    app.get(`${prefix}/summary`, { preHandler: requirePermission('reports:read') }, async (request) => aiAgentSummary(request.user!, request.query as QueryParams));
    app.get(`${prefix}/by-branch`, { preHandler: requirePermission('reports:read') }, async (request) => ({ data: await aiAgentByBranch(request.user!, request.query as QueryParams) }));
    app.get(`${prefix}/by-sale`, { preHandler: requirePermission('reports:read') }, async (request) => ({ data: await aiAgentBySale(request.user!, request.query as QueryParams) }));
    app.get(`${prefix}/by-service`, { preHandler: requirePermission('reports:read') }, async (request) => ({ data: await aiAgentByService(request.user!, request.query as QueryParams) }));
    app.get(`${prefix}/by-source`, { preHandler: requirePermission('reports:read') }, async (request) => ({ data: await aiAgentBySource(request.user!, request.query as QueryParams) }));
    app.get(`${prefix}/errors`, { preHandler: requirePermission('reports:read') }, async (request) => ({ data: await aiAgentErrors(request.user!, request.query as QueryParams) }));
    app.get(`${prefix}/export`, { preHandler: requirePermission('reports:read') }, async (request, reply) => {
      const filters = request.query as QueryParams;
      const [summary, byBranch, bySale, byService, bySource, errors] = await Promise.all([
        aiAgentSummary(request.user!, filters),
        aiAgentByBranch(request.user!, filters),
        aiAgentBySale(request.user!, filters),
        aiAgentByService(request.user!, filters),
        aiAgentBySource(request.user!, filters),
        aiAgentErrors(request.user!, filters),
      ]);
      const workbook = new ExcelJS.Workbook();
      addSheet(workbook, 'Tổng quan', [
        { header: 'Chỉ số', key: 'metric', width: 35 },
        { header: 'Giá trị', key: 'value', width: 18 },
      ], Object.entries(summary).map(([metric, value]) => ({ metric, value })));
      addSheet(workbook, 'Theo cơ sở', [{ header: 'Cơ sở', key: 'name' }, { header: 'Khách', key: 'totalContacts' }, { header: 'AI actions', key: 'aiActions' }], byBranch);
      addSheet(workbook, 'Theo sale', [{ header: 'Sale', key: 'name' }, { header: 'Khách', key: 'totalContacts' }, { header: 'AI actions', key: 'aiActions' }], bySale);
      addSheet(workbook, 'Theo dịch vụ', [{ header: 'Dịch vụ', key: 'name' }, { header: 'Lịch AI', key: 'aiAppointments' }], byService);
      addSheet(workbook, 'Theo nguồn', [{ header: 'Nguồn', key: 'key' }, { header: 'Khách', key: 'totalContacts' }, { header: 'AI actions', key: 'aiActions' }], bySource);
      addSheet(workbook, 'Ca cần kiểm tra', [
        { header: 'Ngày', key: 'createdAt' }, { header: 'Khách', key: 'customer' }, { header: 'SĐT', key: 'phone' },
        { header: 'Loại lỗi', key: 'issueType' }, { header: 'Mức độ', key: 'severity' }, { header: 'Trạng thái', key: 'status' }, { header: 'Lý do', key: 'reason', width: 40 },
      ], errors.map((item) => ({
        createdAt: vietnamDate(item.createdAt),
        customer: item.contact?.fullName || item.contact?.crmName || '',
        phone: item.contact?.phone || '',
        issueType: item.issueType,
        severity: item.severity,
        status: item.status,
        reason: item.reason || '',
      })));
      return sendWorkbook(reply, `ai-agent-report-${yyyymmdd()}.xlsx`, workbook);
    });
  }

  const exportContactsHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as QueryParams;
    const { from, to } = parseDateRange(query);
    const contacts = await prisma.contact.findMany({
      where: { ...scopedContactWhere(request.user!, query), createdAt: { gte: from, lte: to } },
      include: { assignedUser: { select: { fullName: true } }, team: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 10000,
    });
    const workbook = new ExcelJS.Workbook();
    addSheet(workbook, 'Khách hàng', [
      { header: 'Ngày tạo', key: 'createdAt' }, { header: 'Tên', key: 'name' }, { header: 'SĐT', key: 'phone' },
      { header: 'Nguồn', key: 'source' }, { header: 'Trạng thái', key: 'status' }, { header: 'Cơ sở', key: 'team' }, { header: 'Sale', key: 'sale' },
    ], contacts.map((c) => ({ createdAt: vietnamDate(c.createdAt), name: c.fullName || c.crmName || '', phone: c.phone || '', source: c.source || '', status: c.status || '', team: c.team?.name || '', sale: c.assignedUser?.fullName || '' })));
    return sendWorkbook(reply, `contacts-${yyyymmdd()}.xlsx`, workbook);
  };
  for (const path of ['/api/v1/contacts/export', '/api/contacts/export']) {
    app.get(path, { preHandler: requirePermission('contacts:read') }, exportContactsHandler);
  }

  const exportAppointmentsHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as QueryParams;
    const { from, to } = parseDateRange(query);
    const appointments = await prisma.appointment.findMany({
      where: { ...getAppointmentAccessWhere(request.user!), appointmentDate: { gte: from, lte: to } },
      include: { contact: true, branch: { select: { name: true } }, assignedUser: { select: { fullName: true } } },
      orderBy: { appointmentDate: 'desc' },
      take: 10000,
    });
    const workbook = new ExcelJS.Workbook();
    addSheet(workbook, 'Lịch hẹn', [
      { header: 'Thời gian', key: 'time' }, { header: 'Khách', key: 'customer' }, { header: 'SĐT', key: 'phone' },
      { header: 'Dịch vụ', key: 'service' }, { header: 'Cơ sở', key: 'branch' }, { header: 'Trạng thái', key: 'status' }, { header: 'Nguồn', key: 'source' },
    ], appointments.map((a) => ({ time: vietnamDate(a.appointmentDate), customer: a.customerName || a.contact?.fullName || '', phone: a.phone || a.contact?.phone || '', service: a.serviceName || a.type || '', branch: a.branch?.name || '', status: a.status, source: a.source })));
    return sendWorkbook(reply, `appointments-${yyyymmdd()}.xlsx`, workbook);
  };
  for (const path of ['/api/v1/appointments/export', '/api/appointments/export']) {
    app.get(path, { preHandler: requirePermission('appointments:read') }, exportAppointmentsHandler);
  }

  const exportAiLogsHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as QueryParams;
    const { from, to } = parseDateRange(query);
    const contactIds = (await prisma.contact.findMany({ where: scopedContactWhere(request.user!, query), select: { id: true }, take: 10000 })).map((c) => c.id);
    const logs = await prisma.aiActivityLog.findMany({
      where: { orgId: request.user!.orgId, contactId: { in: contactIds }, createdAt: { gte: from, lte: to } },
      include: { contact: { select: { fullName: true, crmName: true, phone: true } } },
      orderBy: { createdAt: 'desc' },
      take: 10000,
    });
    const workbook = new ExcelJS.Workbook();
    addSheet(workbook, 'AI Logs', [
      { header: 'Ngày', key: 'createdAt' }, { header: 'Khách', key: 'customer' }, { header: 'Action', key: 'action' },
      { header: 'Intent', key: 'intent' }, { header: 'Confidence', key: 'confidence' }, { header: 'Output', key: 'output', width: 50 },
    ], logs.map((log) => ({ createdAt: vietnamDate(log.createdAt), customer: log.contact?.fullName || log.contact?.crmName || '', action: log.actionType, intent: log.intent || '', confidence: log.confidence ?? '', output: log.outputMessage || '' })));
    return sendWorkbook(reply, `ai-logs-${yyyymmdd()}.xlsx`, workbook);
  };
  for (const path of ['/api/v1/ai-logs/export', '/api/ai-logs/export']) {
    app.get(path, { preHandler: requirePermission('ai:audit:read') }, exportAiLogsHandler);
  }

  const exportAiReviewHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const rows = await aiAgentErrors(request.user!, request.query as QueryParams);
    const workbook = new ExcelJS.Workbook();
    addSheet(workbook, 'AI Review', [
      { header: 'Ngày', key: 'createdAt' }, { header: 'Khách', key: 'customer' }, { header: 'Loại lỗi', key: 'issueType' },
      { header: 'Mức độ', key: 'severity' }, { header: 'Trạng thái', key: 'status' }, { header: 'Lý do', key: 'reason', width: 50 },
    ], rows.map((item) => ({ createdAt: vietnamDate(item.createdAt), customer: item.contact?.fullName || item.contact?.crmName || '', issueType: item.issueType, severity: item.severity, status: item.status, reason: item.reason || '' })));
    return sendWorkbook(reply, `ai-review-${yyyymmdd()}.xlsx`, workbook);
  };
  for (const path of ['/api/v1/ai-review/export', '/api/ai-review/export']) {
    app.get(path, { preHandler: requirePermission('ai:review:manage') }, exportAiReviewHandler);
  }
}
