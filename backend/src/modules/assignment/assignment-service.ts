import { Prisma } from '@prisma/client';
import { prisma } from '../../shared/database/prisma-client.js';
import { normalizeRole } from '../../shared/auth/permission-matrix.js';

const SALE_ROLES = ['sale', 'cskh', 'member'];

export interface AssignmentActor {
  type: 'system' | 'ai' | 'staff';
  id?: string | null;
}

function assignmentRuleKey(input: { teamId?: string | null; serviceName?: string | null; source?: string | null }) {
  return [
    input.teamId || 'any-team',
    input.serviceName?.toLowerCase() || 'any-service',
    input.source?.toLowerCase() || 'any-source',
  ].join(':');
}

async function contactServiceName(orgId: string, contactId: string) {
  const interested = await prisma.customerProduct.findFirst({
    where: { orgId, customerId: contactId },
    include: { product: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return interested?.product?.name || null;
}

async function findRule(orgId: string, input: { teamId?: string | null; serviceName?: string | null; source?: string | null }) {
  const rules = await prisma.assignmentRule.findMany({
    where: { orgId, isActive: true },
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
  });
  return rules.find((rule) => {
    if (rule.teamId && rule.teamId !== input.teamId) return false;
    if (rule.source && rule.source.toLowerCase() !== (input.source || '').toLowerCase()) return false;
    if (rule.serviceName && rule.serviceName.toLowerCase() !== (input.serviceName || '').toLowerCase()) return false;
    return true;
  }) || null;
}

async function eligibleSales(orgId: string, teamId: string | null, ruleSaleIds: string[]) {
  const users = await prisma.user.findMany({
    where: {
      orgId,
      isActive: true,
      isPending: false,
      ...(teamId ? { teamId } : {}),
      ...(ruleSaleIds.length ? { id: { in: ruleSaleIds } } : {}),
    },
    select: { id: true, role: true, teamId: true, fullName: true },
    orderBy: { createdAt: 'asc' },
  });
  return users.filter((user) => SALE_ROLES.includes(normalizeRole(user.role)));
}

async function nextRoundRobinUser(orgId: string, ruleKey: string, users: Array<{ id: string }>, tx: Prisma.TransactionClient) {
  if (users.length === 0) return null;
  const state = await tx.assignmentState.upsert({
    where: { orgId_ruleKey: { orgId, ruleKey } },
    create: { orgId, ruleKey, cursor: 0 },
    update: { cursor: { increment: 1 } },
  });
  return users[state.cursor % users.length];
}

export async function assignContactToSale(contactId: string, orgId: string, actor: AssignmentActor = { type: 'system' }) {
  return prisma.$transaction(async (tx) => {
    const contact = await tx.contact.findFirst({
      where: { orgId, id: contactId },
      select: { id: true, assignedUserId: true, teamId: true, source: true, fullName: true },
    });
    if (!contact) throw new Error('Contact not found');
    if (contact.assignedUserId) {
      return { contact, assigned: false, reason: 'Khách đã có nhân viên phụ trách' };
    }

    const serviceName = await contactServiceName(orgId, contactId);
    const rule = await findRule(orgId, { teamId: contact.teamId, serviceName, source: contact.source });
    const sales = await eligibleSales(orgId, contact.teamId, rule?.saleUserIds || []);
    if (sales.length === 0) {
      await tx.contact.update({
        where: { orgId_id: { orgId, id: contactId } },
        data: { status: 'unassigned' },
      });
      await tx.contactAssignmentHistory.create({
        data: {
          orgId,
          contactId,
          fromUserId: null,
          toUserId: null,
          teamId: contact.teamId,
          serviceName,
          source: contact.source,
          reason: 'Không có sale active phù hợp theo cơ sở/dịch vụ/source',
          assignedByType: actor.type,
          assignedById: actor.id || null,
          metadata: { ruleId: rule?.id || null },
        },
      });
      return { contact, assigned: false, reason: 'Chưa có người phụ trách' };
    }

    const ruleKey = rule ? `rule:${rule.id}` : assignmentRuleKey({ teamId: contact.teamId, serviceName, source: contact.source });
    const selected = await nextRoundRobinUser(orgId, ruleKey, sales, tx);
    if (!selected) return { contact, assigned: false, reason: 'Chưa có người phụ trách' };

    const updated = await tx.contact.update({
      where: { orgId_id: { orgId, id: contactId } },
      data: { assignedUserId: selected.id, teamId: contact.teamId || sales.find((u) => u.id === selected.id)?.teamId || null },
      include: { assignedUser: { select: { id: true, fullName: true, email: true } } },
    });
    await tx.contactAssignmentHistory.create({
      data: {
        orgId,
        contactId,
        fromUserId: null,
        toUserId: selected.id,
        teamId: updated.teamId,
        serviceName,
        source: contact.source,
        reason: rule ? `Round-robin theo rule "${rule.name}"` : 'Round-robin mặc định theo cơ sở',
        assignedByType: actor.type,
        assignedById: actor.id || null,
        metadata: { ruleId: rule?.id || null, ruleKey, candidateUserIds: sales.map((u) => u.id) },
      },
    });
    return { contact: updated, assigned: true, reason: 'assigned', assignedUserId: selected.id };
  });
}

export async function reassignContact(orgId: string, contactId: string, newSaleId: string | null, reason: string, actor: AssignmentActor) {
  return prisma.$transaction(async (tx) => {
    const contact = await tx.contact.findFirst({ where: { orgId, id: contactId }, select: { assignedUserId: true, teamId: true, source: true } });
    if (!contact) throw new Error('Contact not found');
    let targetTeamId = contact.teamId;
    if (newSaleId) {
      const sale = await tx.user.findFirst({ where: { orgId, id: newSaleId, isActive: true }, select: { id: true, role: true, teamId: true } });
      if (!sale || !SALE_ROLES.includes(normalizeRole(sale.role))) throw new Error('Nhân viên nhận khách không hợp lệ');
      targetTeamId = sale.teamId || targetTeamId;
    }
    const updated = await tx.contact.update({
      where: { orgId_id: { orgId, id: contactId } },
      data: { assignedUserId: newSaleId, teamId: targetTeamId, status: newSaleId ? undefined : 'unassigned' },
      include: { assignedUser: { select: { id: true, fullName: true, email: true } } },
    });
    await tx.contactAssignmentHistory.create({
      data: {
        orgId,
        contactId,
        fromUserId: contact.assignedUserId,
        toUserId: newSaleId,
        teamId: targetTeamId,
        source: contact.source,
        reason,
        assignedByType: actor.type,
        assignedById: actor.id || null,
      },
    });
    return updated;
  });
}
