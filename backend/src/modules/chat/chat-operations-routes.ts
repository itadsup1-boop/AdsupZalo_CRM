/**
 * chat-operations-routes.ts — Extended chat operations: reactions, typing, delete/undo/edit,
 * forward, pin/unpin, sticker, link, card. All ported from openzca CLI capabilities.
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'node:crypto';
import type { Server } from 'socket.io';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { requireZaloAccess } from '../zalo/zalo-access-middleware.js';
import { zaloOps, ZaloOpError } from '../../shared/zalo-operations.js';
import { eventBuffer } from '../../shared/event-buffer.js';
import { logger } from '../../shared/utils/logger.js';

interface ResolvedMessageRefs {
  messageId: string;
  zaloMsgId: string;
  cliMsgId: string;
  ownerId: string;
  repliedByUserId: string | null;
}

async function resolveMessageRefs(conversationId: string, messageId: string, userOrgId: string): Promise<ResolvedMessageRefs | null> {
  const message = await prisma.message.findFirst({
    where: {
      id: messageId,
      conversationId,
      conversation: { orgId: userOrgId },
    },
    select: { id: true, zaloMsgId: true, senderUid: true, repliedByUserId: true },
  });

  if (!message?.zaloMsgId) return null;
  return {
    messageId: message.id,
    zaloMsgId: message.zaloMsgId,
    cliMsgId: message.zaloMsgId,
    ownerId: message.senderUid || '',
    repliedByUserId: message.repliedByUserId || null,
  };
}

// Emoji aliases for reactions
const REACTION_MAP: Record<string, string> = {
  heart: '❤️',
  like: '👍',
  haha: '😆',
  wow: '😮',
  sad: '😭',
  angry: '😡',
};

function mapReaction(r: string): string {
  return REACTION_MAP[r.toLowerCase()] ?? r;
}

// Shared conversation lookup — returns 404 reply when missing
async function getConversation(id: string, orgId: string, reply: FastifyReply) {
  const conv = await prisma.conversation.findFirst({ where: { id, orgId } });
  if (!conv) { reply.status(404).send({ error: 'Conversation not found' }); return null; }
  return conv;
}

function handleError(err: unknown, reply: FastifyReply) {
  if (err instanceof ZaloOpError) return reply.status(err.statusCode).send({ error: err.message });
  logger.error('[chat-ops] Unexpected error:', err);
  return reply.status(500).send({ error: 'Internal server error' });
}

export async function chatOperationsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);

  const chatAccess = { preHandler: requireZaloAccess('chat') };

  // ── POST /reactions ──────────────────────────────────────────────────────────
  app.post('/api/v1/conversations/:id/reactions', chatAccess, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const { msgId, reaction } = request.body as { msgId: string; reaction: string };

    if (!msgId || !reaction) return reply.status(400).send({ error: 'msgId and reaction required' });

    const conv = await getConversation(id, user.orgId, reply);
    if (!conv) return;

    const refs = await resolveMessageRefs(id, msgId, user.orgId);
    if (!refs) return reply.status(404).send({ error: 'Message not found' });

    try {
      const threadType = conv.threadType === 'group' ? 1 : 0;
      const result = await zaloOps.addReaction(
        conv.zaloAccountId,
        mapReaction(reaction),
        { msgId: refs.zaloMsgId, cliMsgId: refs.cliMsgId, threadId: conv.externalThreadId || '', threadType },
      );
      eventBuffer.recordReaction(id, refs.messageId, user.id, user.email, reaction, 'add');
      await prisma.messageReaction.upsert({
        where: { messageId_reactorId: { messageId: refs.messageId, reactorId: user.id } },
        update: { emoji: mapReaction(reaction) },
        create: {
          id: randomUUID(),
          orgId: user.orgId,
          messageId: refs.messageId,
          reactorId: user.id,
          emoji: mapReaction(reaction),
        },
      });
      const io = (app as any).io as Server;
      io?.emit('chat:reactions', {
        conversationId: id,
        messageId: refs.messageId,
        msgId: refs.messageId,
        reactions: [{ userId: user.id, userName: user.email, reaction: mapReaction(reaction), action: 'add' }],
      });
      return { success: true, result };
    } catch (err) { return handleError(err, reply); }
  });

  // ── POST /typing ─────────────────────────────────────────────────────────────
  app.post('/api/v1/conversations/:id/typing', chatAccess, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };

    const conv = await getConversation(id, user.orgId, reply);
    if (!conv) return;

    try {
      const threadType = conv.threadType === 'group' ? 1 : 0;
      await zaloOps.sendTypingEvent(conv.zaloAccountId, conv.externalThreadId || '', threadType);
      eventBuffer.recordTyping(id, user.id, user.email);
      return { success: true };
    } catch (err) { return handleError(err, reply); }
  });

  // ── DELETE /messages/:msgId ──────────────────────────────────────────────────
  app.delete('/api/v1/conversations/:id/messages/:msgId', chatAccess, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id, msgId } = request.params as { id: string; msgId: string };
    const { onlyMe = false } = (request.body ?? {}) as { onlyMe?: boolean };

    const conv = await getConversation(id, user.orgId, reply);
    if (!conv) return;

    const refs = await resolveMessageRefs(id, msgId, user.orgId);
    if (!refs) return reply.status(404).send({ error: 'Message not found' });

    try {
      const threadType = conv.threadType === 'group' ? 1 : 0;
      await zaloOps.deleteMessage(conv.zaloAccountId, refs.zaloMsgId, refs.cliMsgId, refs.ownerId, conv.externalThreadId || '', threadType, onlyMe);

      if (!onlyMe) {
        await prisma.message.update({ where: { id: refs.messageId }, data: { isDeleted: true, deletedAt: new Date() } });
      }

      const io = (app as any).io as Server;
      io?.emit('chat:deleted', { conversationId: id, messageId: refs.messageId, zaloMsgId: refs.zaloMsgId });
      return { success: true };
    } catch (err) { return handleError(err, reply); }
  });

  // ── POST /messages/:msgId/undo ───────────────────────────────────────────────
  app.post('/api/v1/conversations/:id/messages/:msgId/undo', chatAccess, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id, msgId } = request.params as { id: string; msgId: string };

    const conv = await getConversation(id, user.orgId, reply);
    if (!conv) return;

    const refs = await resolveMessageRefs(id, msgId, user.orgId);
    if (!refs) return reply.status(404).send({ error: 'Message not found' });

    try {
      const threadType = conv.threadType === 'group' ? 1 : 0;

      await zaloOps.undoMessage(conv.zaloAccountId, refs.zaloMsgId, refs.cliMsgId, refs.ownerId, conv.externalThreadId || '', threadType);
      await prisma.message.update({ where: { id: refs.messageId }, data: { isDeleted: true, deletedAt: new Date() } });

      const io = (app as any).io as Server;
      io?.emit('chat:deleted', { conversationId: id, messageId: refs.messageId, zaloMsgId: refs.zaloMsgId });
      return { success: true };
    } catch (err) { return handleError(err, reply); }
  });

  // ── POST /messages/:msgId/edit ───────────────────────────────────────────────
  app.post('/api/v1/conversations/:id/messages/:msgId/edit', chatAccess, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id, msgId } = request.params as { id: string; msgId: string };
    const { content } = request.body as { content: string };

    if (!content?.trim()) return reply.status(400).send({ error: 'content required' });

    const conv = await getConversation(id, user.orgId, reply);
    if (!conv) return;

    const refs = await resolveMessageRefs(id, msgId, user.orgId);
    if (!refs) return reply.status(404).send({ error: 'Message not found' });

    try {
      if (refs.repliedByUserId !== user.id) return reply.status(403).send({ error: 'Can only edit your own messages' });

      const threadType = conv.threadType === 'group' ? 1 : 0;
      await zaloOps.editMessage(conv.zaloAccountId, refs.zaloMsgId, refs.cliMsgId, content, conv.externalThreadId || '', threadType);
      await prisma.message.update({ where: { id: refs.messageId }, data: { content, updatedAt: new Date() } });

      const io = (app as any).io as Server;
      io?.emit('chat:message-edited', { conversationId: id, messageId: refs.messageId, zaloMsgId: refs.zaloMsgId, content });
      return { success: true };
    } catch (err) { return handleError(err, reply); }
  });

  // ── POST /forward ────────────────────────────────────────────────────────────
  app.post('/api/v1/conversations/:id/forward', chatAccess, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const { msgId, targetConversationIds } = request.body as { msgId: string; targetConversationIds: string[] };

    if (!msgId || !targetConversationIds?.length) {
      return reply.status(400).send({ error: 'msgId and targetConversationIds required' });
    }

    const conv = await getConversation(id, user.orgId, reply);
    if (!conv) return;

    const refs = await resolveMessageRefs(id, msgId, user.orgId);
    if (!refs) return reply.status(404).send({ error: 'Message not found' });

    try {
      const targets = await prisma.conversation.findMany({
        where: { id: { in: targetConversationIds }, orgId: user.orgId },
        select: { id: true, threadType: true, externalThreadId: true },
      });

      let forwarded = 0;
      for (const target of targets) {
        const threadType = target.threadType === 'group' ? 1 : 0;
        await zaloOps.forwardMessage(conv.zaloAccountId, refs.zaloMsgId, target.externalThreadId || '', threadType);
        forwarded++;
      }
      return { success: true, forwarded };
    } catch (err) { return handleError(err, reply); }
  });

  // ── POST /pin ────────────────────────────────────────────────────────────────
  app.post('/api/v1/conversations/:id/pin', chatAccess, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };

    const conv = await getConversation(id, user.orgId, reply);
    if (!conv) return;

    try {
      const threadType = conv.threadType === 'group' ? 1 : 0;
      const result = await zaloOps.pinConversation(conv.zaloAccountId, true, conv.externalThreadId || '', threadType);
      await prisma.pinnedConversation.upsert({
        where: { zaloAccountId_conversationId: { zaloAccountId: conv.zaloAccountId, conversationId: id } },
        update: { pinnedAt: new Date() },
        create: { id: randomUUID(), orgId: user.orgId, zaloAccountId: conv.zaloAccountId, conversationId: id },
      });
      const io = (app as any).io as Server;
      io?.emit('chat:pinned', { conversationId: id, isPinned: true });
      return { success: true, result };
    } catch (err) { return handleError(err, reply); }
  });

  // ── POST /unpin ──────────────────────────────────────────────────────────────
  app.post('/api/v1/conversations/:id/unpin', chatAccess, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };

    const conv = await getConversation(id, user.orgId, reply);
    if (!conv) return;

    try {
      const threadType = conv.threadType === 'group' ? 1 : 0;
      const result = await zaloOps.pinConversation(conv.zaloAccountId, false, conv.externalThreadId || '', threadType);
      await prisma.pinnedConversation.deleteMany({
        where: { zaloAccountId: conv.zaloAccountId, conversationId: id },
      });
      const io = (app as any).io as Server;
      io?.emit('chat:unpinned', { conversationId: id, isPinned: false });
      return { success: true, result };
    } catch (err) { return handleError(err, reply); }
  });

  // ── POST /sticker ────────────────────────────────────────────────────────────
  app.post('/api/v1/conversations/:id/sticker', chatAccess, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const { stickerId } = request.body as { stickerId: number };

    if (!stickerId) return reply.status(400).send({ error: 'stickerId required' });

    const conv = await getConversation(id, user.orgId, reply);
    if (!conv) return;

    try {
      const threadType = conv.threadType === 'group' ? 1 : 0;
      const result = await zaloOps.sendSticker(conv.zaloAccountId, stickerId, conv.externalThreadId || '', threadType);

      await prisma.message.create({
        data: {
          id: randomUUID(),
          orgId: user.orgId,
          conversationId: id,
          senderType: 'self',
          senderUid: '',
          senderName: 'Staff',
          content: String(stickerId),
          contentType: 'sticker',
          sentAt: new Date(),
          repliedByUserId: user.id,
        },
      });

      return { success: true, result };
    } catch (err) { return handleError(err, reply); }
  });

  // ── POST /link ───────────────────────────────────────────────────────────────
  app.post('/api/v1/conversations/:id/link', chatAccess, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const { url } = request.body as { url: string };

    if (!url?.trim()) return reply.status(400).send({ error: 'url required' });

    const conv = await getConversation(id, user.orgId, reply);
    if (!conv) return;

    try {
      const threadType = conv.threadType === 'group' ? 1 : 0;
      const result = await zaloOps.sendLink(conv.zaloAccountId, conv.externalThreadId || '', threadType, { link: url });

      await prisma.message.create({
        data: {
          id: randomUUID(),
          orgId: user.orgId,
          conversationId: id,
          senderType: 'self',
          senderUid: '',
          senderName: 'Staff',
          content: url,
          contentType: 'link',
          sentAt: new Date(),
          repliedByUserId: user.id,
        },
      });

      return { success: true, result };
    } catch (err) { return handleError(err, reply); }
  });

  // ── POST /card ───────────────────────────────────────────────────────────────
  app.post('/api/v1/conversations/:id/card', chatAccess, async (request: FastifyRequest, reply: FastifyReply) => {
    // ... [existing POST /card code] ...
    const user = request.user!;
    const { id } = request.params as { id: string };
    const { contactId } = request.body as { contactId: string };

    if (!contactId?.trim()) return reply.status(400).send({ error: 'contactId required' });

    const conv = await getConversation(id, user.orgId, reply);
    if (!conv) return;

    try {
      let targetZaloUid = '';
      let targetPhone = '';

      const contactTarget = await prisma.contact.findFirst({ where: { id: contactId, orgId: user.orgId } });
      if (contactTarget) {
        targetZaloUid = contactTarget.zaloUid || '';
        targetPhone = contactTarget.phone || '';
      } else {
        const userTarget = await prisma.zaloAccount.findFirst({ where: { ownerUserId: contactId, orgId: user.orgId } });
        if (userTarget) {
          targetZaloUid = userTarget.zaloUid || '';
          targetPhone = userTarget.phone || '';
        }
      }

      if (!targetZaloUid && !targetPhone) {
        return reply.status(400).send({ error: 'Cannot share this contact because they do not have a Zalo UID or phone number.' });
      }

      const cardData = { userId: targetZaloUid };
      const threadType = conv.threadType === 'group' ? 1 : 0;
      const result = await zaloOps.sendCard(conv.zaloAccountId, conv.externalThreadId || '', threadType, cardData);

      await prisma.message.create({
        data: {
          id: randomUUID(),
          orgId: user.orgId,
          conversationId: id,
          senderType: 'self',
          senderUid: '',
          senderName: 'Staff',
          content: targetZaloUid || targetPhone || contactId,
          contentType: 'contact_card',
          sentAt: new Date(),
          repliedByUserId: user.id,
        },
      });

      return { success: true, result };
    } catch (err) { return handleError(err, reply); }
  });

  // ── GET /labels ──────────────────────────────────────────────────────────────
  app.get('/api/v1/zalo-accounts/:id/labels', { preHandler: requireZaloAccess('read') }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    
    const account = await prisma.zaloAccount.findFirst({ where: { id, orgId: user.orgId } });
    if (!account) return reply.status(404).send({ error: 'Account not found' });

    try {
      const result = await zaloOps.getLabels(account.id) as any;
      return { success: true, labels: result?.labelData || [], version: result?.version || 0 };
    } catch (err) { return handleError(err, reply); }
  });

  // ── PUT /labels ── full replace (used by label manager UI) ──────────────────
  app.put('/api/v1/zalo-accounts/:id/labels', { preHandler: requireZaloAccess('chat') }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const { labelData, version } = request.body as { labelData: any[]; version: number };

    if (!Array.isArray(labelData)) return reply.status(400).send({ error: 'labelData array required' });

    const account = await prisma.zaloAccount.findFirst({ where: { id, orgId: user.orgId } });
    if (!account) return reply.status(404).send({ error: 'Account not found' });

    try {
      const result = await zaloOps.updateLabels(account.id, labelData, version || 0) as any;
      return { success: true, labels: result?.labelData || labelData };
    } catch (err) { return handleError(err, reply); }
  });

  // ── POST /labels ─────────────────────────────────────────────────────────────
  app.post('/api/v1/conversations/:id/labels', chatAccess, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const { labelIds } = request.body as { labelIds: number[] }; // Array of active label IDs for this conversation

    if (!Array.isArray(labelIds)) return reply.status(400).send({ error: 'labelIds array required' });

    const conv = await getConversation(id, user.orgId, reply);
    if (!conv || !conv.externalThreadId) return;

    try {
      // 1. Fetch current labels from Zalo (need version for the update call)
      const labelsRes = await zaloOps.getLabels(conv.zaloAccountId) as any;
      const allLabels = (labelsRes?.labelData || []) as any[];
      const version = labelsRes?.version || 0;

      // 2. Modify conversations array for each label
      const updatedLabels = allLabels.map((lbl: any) => {
        const hasTag = labelIds.includes(lbl.id);
        const convs = new Set(lbl.conversations || []);
        
        if (hasTag) {
          convs.add(conv.externalThreadId);
        } else {
          convs.delete(conv.externalThreadId);
        }
        
        return {
          ...lbl,
          conversations: Array.from(convs)
        };
      });

      // 3. Update back to Zalo — must include version!
      const result = await zaloOps.updateLabels(conv.zaloAccountId, updatedLabels, version);
      
      // Emit socket event to update frontend instantly
      const io = (app as any).io as Server;
      io?.emit('chat:labels-updated', { conversationId: id, labelIds });

      return { success: true, result };
    } catch (err) { return handleError(err, reply); }
  });
}



// Socket.IO event handlers for chat operations
export function registerChatSocketHandlers(io: Server): void {
  // Store presence data in-memory (for production, use Redis)
  const presence = new Map<string, { userId: string; userName: string; conversationId: string | null }>();

  io.on('connection', (socket) => {
    logger.info(`[socket] Client connected: ${socket.id}`);

    // 1. Join room (Org-based isolation)
    socket.on('join:org', (orgId: string) => {
      socket.join(`org:${orgId}`);
      logger.info(`[socket] Client ${socket.id} joined org:${orgId}`);
    });

    // 2. Presence & Viewing
    socket.on('presence:viewing', (data: { orgId: string; userId: string; userName: string; conversationId: string | null }) => {
      presence.set(socket.id, { userId: data.userId, userName: data.userName, conversationId: data.conversationId });
      
      // Broadcast presence to others in the same org
      io.to(`org:${data.orgId}`).emit('presence:update', Array.from(presence.values()));
      
      // Handle Conversation Locking logic
      if (data.conversationId) {
        socket.join(`conv:${data.conversationId}`);
        // Notify others that this conversation is being viewed/locked
        socket.to(`org:${data.orgId}`).emit('chat:locked', {
          conversationId: data.conversationId,
          lockedBy: data.userId,
          lockedByName: data.userName,
          expiresAt: new Date(Date.now() + 30000).toISOString() // 30s lock
        });
      }
    });

    // 3. Typing indicator
    socket.on('chat:typing', (data: { orgId: string; conversationId: string; userId: string; userName: string; isTyping: boolean }) => {
      socket.to(`org:${data.orgId}`).emit('chat:typing', data);
      
      if (data.isTyping) {
        eventBuffer.recordTyping(data.conversationId, data.userId, data.userName);
      }
    });

    // 4. Seen status
    socket.on('chat:seen', (data: { orgId: string; conversationId: string; userId: string; lastMsgId: string }) => {
      socket.to(`org:${data.orgId}`).emit('chat:seen', data);
      
      // Update DB seen status
      prisma.conversation.update({
        where: { id: data.conversationId },
        data: { unreadCount: 0, isReplied: true }
      }).catch(err => logger.error('[socket] Failed to update seen status:', err));
    });

    socket.on('disconnect', () => {
      const p = presence.get(socket.id);
      if (p) {
        presence.delete(socket.id);
        // Clean up locks if needed
      }
      logger.info(`[socket] Client disconnected: ${socket.id}`);
    });
  });
}
