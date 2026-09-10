import { prisma } from '../database/prisma-client.js';
import { logger } from './logger.js';
import { normalizeRole } from '../auth/permission-matrix.js';

export interface ScopedUser {
  id: string;
  orgId: string;
  role: string;
  teamId?: string | null;
}

function isOwnerOrAdmin(user: ScopedUser) {
  return ['owner', 'admin'].includes(normalizeRole(user.role));
}

function userZaloAccountWhere(user: ScopedUser) {
  return {
    OR: [
      { ownerUserId: user.id },
      { access: { some: { userId: user.id } } },
    ],
  };
}

// Helper 1: Contact query filter scope
export function getContactAccessWhere(user: ScopedUser) {
  if (isOwnerOrAdmin(user)) return { orgId: user.orgId };
  return {
    orgId: user.orgId,
    conversations: {
      some: {
        zaloAccount: userZaloAccountWhere(user),
      },
    },
  };
}

// Helper 2: Appointment query filter scope
export function getAppointmentAccessWhere(user: ScopedUser) {
  const role = normalizeRole(user.role);
  if (['owner', 'admin'].includes(role)) {
    return { orgId: user.orgId };
  }
  if (role === 'branch_manager' || role === 'cskh') {
    return {
      orgId: user.orgId,
      OR: [
        ...(user.teamId ? [{ branchId: user.teamId }, { contact: { teamId: user.teamId } }] : []),
        { assignedUserId: user.id },
      ],
    };
  }
  
  return {
    orgId: user.orgId,
    OR: [
      { assignedUserId: user.id },
      { contact: getContactAccessWhere(user) }
    ]
  };
}

// Helper 3: Zalo Account query filter scope
export function getZaloAccountAccessWhere(user: ScopedUser) {
  if (isOwnerOrAdmin(user)) return { orgId: user.orgId };
  return {
    orgId: user.orgId,
    ...userZaloAccountWhere(user),
  };
}

// Helper 4: Conversation query filter scope
export function getConversationAccessWhere(user: ScopedUser) {
  if (isOwnerOrAdmin(user)) return { orgId: user.orgId };
  return {
    orgId: user.orgId,
    zaloAccount: userZaloAccountWhere(user),
  };
}

// Helper 5: canAccessZaloAccount
export async function canAccessZaloAccount(user: ScopedUser, accountId: string): Promise<boolean> {
  const count = await prisma.zaloAccount.count({
    where: {
      id: accountId,
      ...getZaloAccountAccessWhere(user),
    }
  });
  return count > 0;
}

// Helper 6: canAccessContact
export async function canAccessContact(user: ScopedUser, contactId: string): Promise<boolean> {
  const count = await prisma.contact.count({
    where: {
      id: contactId,
      ...getContactAccessWhere(user),
    }
  });
  return count > 0;
}

// Helper 7: getZaloAccountAuthorizedUserIds
export async function getZaloAccountAuthorizedUserIds(accountId: string): Promise<string[]> {
  const userIds = new Set<string>();

  try {
    const account = await prisma.zaloAccount.findUnique({
      where: { id: accountId },
      select: { orgId: true, ownerUserId: true },
    });
    if (account?.orgId) {
      const privilegedUsers = await prisma.user.findMany({
        where: { orgId: account.orgId, isActive: true, role: { in: ['owner', 'admin'] } },
        select: { id: true },
      });
      for (const user of privilegedUsers) {
        userIds.add(user.id);
      }
      if (account.ownerUserId) userIds.add(account.ownerUserId);

      const accesses = await prisma.zaloAccountAccess.findMany({
        where: { zaloAccountId: accountId },
        select: { userId: true },
      });
      for (const access of accesses) {
        userIds.add(access.userId);
      }
    }
  } catch (err) {
    logger.error('[permission:authorized_users] Failed to get authorized user IDs:', err);
  }

  return Array.from(userIds);
}

// Helper 8: getConversationTargetRooms using Set to prevent duplicates
export async function getConversationTargetRooms(conversationId: string, orgId: string): Promise<string[]> {
  const rooms = new Set<string>();
  
  try {
    const conv = await prisma.conversation.findFirst({
      where: { id: conversationId, orgId },
      select: { zaloAccountId: true }
    });

    if (conv?.zaloAccountId) {
      const userIds = await getZaloAccountAuthorizedUserIds(conv.zaloAccountId);
      for (const userId of userIds) rooms.add(`org_${orgId}_user_${userId}`);
    }
  } catch (err) {
    logger.error('[socket:rooms] Failed to get conversation target rooms:', err);
  }

  return Array.from(rooms);
}

// Helper 9: emitToConversationRooms
export async function emitToConversationRooms(io: any, conversationId: string, orgId: string, event: string, payload: any) {
  if (!io) return;
  try {
    const rooms = await getConversationTargetRooms(conversationId, orgId);
    for (const room of rooms) io.to(room).emit(event, payload);
  } catch (err) {
    logger.error('[socket:rooms] Failed in emitToConversationRooms:', err);
  }
}

// Helper 10: getContactTargetRooms
export async function getContactTargetRooms(contactId: string, orgId: string): Promise<string[]> {
  const rooms = new Set<string>();
  try {
    const contact = await prisma.contact.findFirst({
      where: { id: contactId, orgId },
      select: { conversations: { select: { zaloAccountId: true } } },
    });
    for (const conv of contact?.conversations || []) {
      if (!conv.zaloAccountId) continue;
      const userIds = await getZaloAccountAuthorizedUserIds(conv.zaloAccountId);
      for (const userId of userIds) rooms.add(`org_${orgId}_user_${userId}`);
    }
  } catch (err) {
    logger.error('[socket:rooms] Failed to get contact target rooms:', err);
  }
  return Array.from(rooms);
}

// Helper 11: emitToContactRooms
export async function emitToContactRooms(io: any, contactId: string, orgId: string, event: string, payload: any) {
  if (!io) return;
  try {
    const rooms = await getContactTargetRooms(contactId, orgId);
    for (const room of rooms) io.to(room).emit(event, payload);
  } catch (err) {
    logger.error('[socket:rooms] Failed in emitToContactRooms:', err);
  }
}
