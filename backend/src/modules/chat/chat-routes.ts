/**
 * chat-routes.ts — REST API for conversations and messages.
 * All routes require JWT auth and are scoped to the user's org.
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { getConversationAccessWhere, emitToConversationRooms } from '../../shared/utils/permission-scope.js';
import { requireZaloAccess } from '../zalo/zalo-access-middleware.js';
import { zaloPool } from '../zalo/zalo-pool.js';
import { zaloRateLimiter } from '../zalo/zalo-rate-limiter.js';
import { logger } from '../../shared/utils/logger.js';
import { createHash, randomUUID } from 'node:crypto';
import type { Server } from 'socket.io';

type QueryParams = Record<string, string>;

function mapReplyMsgType(contentType: string): string {
  if (contentType === 'text') return 'webchat';
  if (contentType === 'image') return 'photo';
  if (contentType === 'file') return 'file';
  if (contentType === 'video') return 'video';
  if (contentType === 'voice') return 'voice';
  if (contentType === 'sticker') return 'sticker';
  if (contentType === 'gif') return 'gif';
  if (contentType === 'link') return 'link';
  if (contentType === 'location') return 'location';
  if (contentType === 'contact_card') return 'card';
  if (contentType === 'bank_transfer') return 'bank';
  if (contentType === 'call') return 'call';
  if (contentType === 'qr_code') return 'qr';
  if (contentType === 'reminder') return 'remind';
  if (contentType === 'poll') return 'poll';
  if (contentType === 'note') return 'note';
  if (contentType === 'forwarded') return 'forward';
  return contentType;
}

function buildReplyQuote(message: {
  zaloMsgId: string | null;
  senderUid: string | null;
  content: string | null;
  contentType: string;
  sentAt: Date;
}) {
  if (!message.zaloMsgId || !message.senderUid) return null;
  return {
    content: message.content ?? '',
    msgType: mapReplyMsgType(message.contentType),
    propertyExt: {},
    uidFrom: message.senderUid,
    msgId: message.zaloMsgId,
    cliMsgId: message.zaloMsgId,
    ts: String(message.sentAt.getTime()),
    ttl: 0,
  };
}

export async function chatRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);

  // ── Conversation filter counts (unread, unreplied, total) ───────────────
  // NOTE: Must be registered BEFORE /api/v1/conversations/:id to avoid route conflict
  app.get('/api/v1/conversations/counts', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { accountId = '', tab = '' } = request.query as QueryParams;

    const baseWhere: any = {
      ...getConversationAccessWhere(user),
    };
    if (accountId) baseWhere.AND = [...(baseWhere.AND || []), { zaloAccountId: accountId }];
    if (tab) baseWhere.tab = tab;

    const [unread, unreplied, total] = await Promise.all([
      prisma.conversation.count({ where: { ...baseWhere, unreadCount: { gt: 0 } } }),
      prisma.conversation.count({ where: { ...baseWhere, isReplied: false } }),
      prisma.conversation.count({ where: baseWhere }),
    ]);

    logger.info('[conversations:counts] account-scoped visibility', {
      currentUser: {
        id: user.id,
        name: (user as any).fullName || user.email,
        role: user.role,
        orgId: user.orgId,
      },
      selectedZaloAccountId: accountId || null,
      where: baseWhere,
      total,
      unread,
      unreplied,
    });

    return { unread, unreplied, total };
  });

  // ── List conversations (paginated, filterable) ──────────────────────────
  app.get('/api/v1/conversations', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const {
      page = '1',
      limit = '50',
      search = '',
      accountId = '',
      // Filter params
      unread = '',
      unreplied = '',
      from = '',
      to = '',
      tags = '',
      tab = '',
    } = request.query as QueryParams;

    const where: any = {
      ...getConversationAccessWhere(user),
    };
    if (tab) where.tab = tab;
    if (accountId) where.AND = [...(where.AND || []), { zaloAccountId: accountId }];
    if (search) {
      where.contact = {
        OR: [
          { fullName: { contains: search, mode: 'insensitive' } },
          { crmName: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search } },
        ],
      };
    }

    // Advanced filters
    if (unread === 'true') where.unreadCount = { gt: 0 };
    if (unreplied === 'true') where.isReplied = false;
    if (from || to) {
      where.lastMessageAt = {};
      if (from) {
        const d = new Date(from);
        if (!isNaN(d.getTime())) where.lastMessageAt.gte = d;
      }
      if (to) {
        const d = new Date(to);
        if (!isNaN(d.getTime())) where.lastMessageAt.lte = d;
      }
      // Remove empty filter if both dates invalid
      if (Object.keys(where.lastMessageAt).length === 0) delete where.lastMessageAt;
    }
    if (tags) {
      const tagList = tags.split(',').map((t) => t.trim()).filter(Boolean);
      if (tagList.length > 0) {
        // Merge with any existing contact filter from search
        where.contact = {
          ...where.contact,
          tags: { array_contains: tagList },
        };
      }
    }

    // All roles can see conversations for all Zalo accounts in their organization

    const [conversations, total] = await Promise.all([
      prisma.conversation.findMany({
        where,
        include: {
          contact: { select: { id: true, fullName: true, crmName: true, phone: true, avatarUrl: true, zaloUid: true } },
          zaloAccount: { select: { id: true, displayName: true, zaloUid: true } },
          zaloOaAccount: { select: { id: true, name: true, avatarUrl: true } },
          pins: { select: { id: true } },
          messages: {
            take: 1,
            orderBy: { sentAt: 'desc' },
            select: { id: true, zaloMsgId: true, senderUid: true, senderName: true, content: true, contentType: true, senderType: true, sentAt: true, isDeleted: true, reactions: { select: { emoji: true, reactorId: true } } },
          },
        },
        orderBy: { lastMessageAt: 'desc' },
        skip: (parseInt(page) - 1) * Math.min(parseInt(limit), 200),
        take: Math.min(parseInt(limit), 200),
      }),
      prisma.conversation.count({ where }),
    ]);

    logger.info('[conversations:list] account-scoped visibility', {
      currentUser: {
        id: user.id,
        name: (user as any).fullName || user.email,
        role: user.role,
        orgId: user.orgId,
      },
      selectedZaloAccountId: accountId || null,
      where,
      returned: conversations.length,
      total,
    });

    return {
      conversations: conversations.map((conversation) => ({ ...conversation, isPinned: conversation.pins.length > 0 })),
      total,
      page: parseInt(page),
      limit: Math.min(parseInt(limit), 200),
    };
  });

  // ── Get single conversation ──────────────────────────────────────────────
  app.get('/api/v1/conversations/:id', { preHandler: requireZaloAccess('read') }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };

    const conversation = await prisma.conversation.findFirst({
      where: { id, orgId: user.orgId },
      include: {
        contact: true,
        zaloAccount: { select: { id: true, displayName: true, zaloUid: true, status: true } },
        zaloOaAccount: { select: { id: true, name: true, avatarUrl: true, status: true } },
        pins: { select: { id: true } },
      },
    });
    if (!conversation) return reply.status(404).send({ error: 'Not found' });

    return { ...conversation, isPinned: conversation.pins.length > 0 };
  });

  // ── List messages for a conversation (paginated, newest first) ──────────
  app.get('/api/v1/conversations/:id/messages', { preHandler: requireZaloAccess('read') }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const { page = '1', limit = '50' } = request.query as QueryParams;

    const conversation = await prisma.conversation.findFirst({
      where: { id, orgId: user.orgId },
      select: { id: true },
    });
    if (!conversation) return reply.status(404).send({ error: 'Conversation not found' });

    const [messages, total] = await Promise.all([
      prisma.message.findMany({
        where: { conversationId: id },
        orderBy: { sentAt: 'desc' },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
        select: {
          id: true,
          zaloMsgId: true,
          senderUid: true,
          senderName: true,
          content: true,
          contentType: true,
          fileUrl: true,
          fileName: true,
          mimeType: true,
          duration: true,
          size: true,
          attachments: true,
          senderType: true,
          sentAt: true,
          isDeleted: true,
          quote: true,
          reactions: { select: { emoji: true, reactorId: true } },
        },
      }),
      prisma.message.count({ where: { conversationId: id } }),
    ]);

    return { messages: messages.reverse(), total, page: parseInt(page), limit: parseInt(limit) };
  });

  // ── Send message ─────────────────────────────────────────────────────────
  app.post('/api/v1/conversations/:id/messages', { preHandler: requireZaloAccess('chat') }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const { content, replyMessageId } = request.body as { content: string; replyMessageId?: string };

    if (!content?.trim()) return reply.status(400).send({ error: 'Content required' });

    const conversation = await prisma.conversation.findFirst({
      where: { id, orgId: user.orgId },
      include: { zaloAccount: true, zaloOaAccount: true },
    });
    if (!conversation) return reply.status(404).send({ error: 'Conversation not found' });

    // ── Zalo OA Sending Logic ───────────────────────────────────────────────
    if (conversation.zaloOaAccountId) {
      try {
        const { zaloOAService } = await import('../zalo-oa/zalo-oa-service.js');
        const sendResult = await zaloOAService.sendTextMessage(
          conversation.zaloOaAccountId,
          user.orgId,
          conversation.externalThreadId || '',
          content
        );

        const message = await prisma.message.create({
          data: {
            id: randomUUID(),
            orgId: user.orgId,
            conversationId: id,
            zaloMsgId: String(sendResult?.data?.msg_id || ''),
            senderType: 'self',
            senderUid: conversation.zaloOaAccount?.oaId || '',
            senderName: 'Staff',
            content,
            contentType: 'text',
            sentAt: new Date(),
            repliedByUserId: user.id,
          },
        });

        await prisma.conversation.update({
          where: { orgId: user.orgId, id },
          data: { lastMessageAt: new Date(), isReplied: true, unreadCount: 0, aiPaused: true },
        });

        const io = (app as any).io as Server;
        await emitToConversationRooms(io, id, user.orgId, 'chat:ai-status', { conversationId: id, aiPaused: true });
        await emitToConversationRooms(io, id, user.orgId, 'chat:message', { 
          accountId: conversation.zaloOaAccountId, 
          isOA: true,
          message, 
          conversationId: id 
        });

        return message;
      } catch (err: any) {
        logger.error('[chat] Send OA message error:', err);
        return reply.status(500).send({ error: err.message || 'Failed to send OA message' });
      }
    }

    // ── Personal Zalo Sending Logic ─────────────────────────────────────────
    const instance = zaloPool.getInstance(conversation.zaloAccountId!);
    if (!instance?.api) return reply.status(400).send({ error: 'Zalo account not connected' });

    // Rate limit check — prevent account blocking
    const limits = await zaloRateLimiter.checkLimits(conversation.zaloAccountId!);
    if (!limits.allowed) {
      return reply.status(429).send({ error: limits.reason });
    }

    try {
      const threadId = conversation.externalThreadId || '';
      // zca-js sendMessage(message, threadId, type) — type: 0=User, 1=Group
      const threadType = conversation.threadType === 'group' ? 1 : 0;

      let quote: ReturnType<typeof buildReplyQuote> | null = null;
      if (replyMessageId) {
        const replyMessage = await prisma.message.findFirst({
          where: { id: replyMessageId, conversationId: id },
          select: { zaloMsgId: true, senderUid: true, content: true, contentType: true, sentAt: true },
        });
        if (replyMessage) {
          quote = buildReplyQuote(replyMessage);
        }
      }

      const messageFingerprint = createHash('sha256').update(`${id}:${content}:${replyMessageId || ''}`).digest('hex');
      const duplicate = await prisma.message.findFirst({
        where: { orgId: user.orgId, conversationId: id, messageFingerprint, senderType: 'self', deliveryStatus: { in: ['pending', 'sent', 'retrying'] } },
      });
      if (duplicate) return duplicate;

      const message = await prisma.message.create({
        data: {
          id: randomUUID(),
          orgId: user.orgId,
          conversationId: id,
          zaloMsgId: null,
          senderType: 'self',
          senderUid: conversation.zaloAccount?.zaloUid || '',
          senderName: 'Staff',
          content,
          contentType: 'text',
          deliveryStatus: 'pending',
          messageFingerprint,
          quote: quote ?? undefined,
          sentAt: new Date(),
          repliedByUserId: user.id,
        },
      });

      let sentMessage = message;
      try {
        zaloRateLimiter.recordSend(conversation.zaloAccountId!);
        const sendResult = await instance.api.sendMessage(quote ? { msg: content, quote } : { msg: content }, threadId, threadType);
        const zaloMsgId = String(sendResult?.msgId || sendResult?.data?.msgId || '');
        sentMessage = await prisma.message.update({
          where: { id: message.id },
          data: { zaloMsgId: zaloMsgId || null, deliveryStatus: 'sent', lastSendError: null },
        });
      } catch (sendErr) {
        const retryAt = new Date(Date.now() + 5 * 60 * 1000);
        await prisma.message.update({
          where: { id: message.id },
          data: {
            deliveryStatus: 'retrying',
            retryCount: { increment: 1 },
            lastSendError: sendErr instanceof Error ? sendErr.message : String(sendErr),
            nextRetryAt: retryAt,
          },
        });
        const { logAiActivity } = await import('../ai/ai-audit-service.js');
        await logAiActivity({
          orgId: user.orgId,
          conversationId: id,
          messageId: message.id,
          actorType: 'system',
          actionType: 'zalo.send_failed',
          inputMessage: content,
          confidence: 0,
          review: {
            issueType: 'send_failed',
            severity: 'high',
            reason: sendErr instanceof Error ? sendErr.message : String(sendErr),
            aiResponse: content,
          },
        });
        return reply.status(502).send({ error: 'Zalo send failed, queued for retry', messageId: message.id });
      }

      await prisma.conversation.update({
        where: { orgId: user.orgId, id },
        data: { lastMessageAt: new Date(), lastStaffMessageAt: new Date(), isReplied: true, unreadCount: 0, aiPaused: true },
      });

      const io = (app as any).io as Server;
      await emitToConversationRooms(io, id, user.orgId, 'chat:ai-status', { conversationId: id, aiPaused: true });
      await emitToConversationRooms(io, id, user.orgId, 'chat:message', { accountId: conversation.zaloAccountId, message: sentMessage, conversationId: id });

      return sentMessage;
    } catch (err) {
      logger.error('[chat] Send message error:', err);
      return reply.status(500).send({ error: 'Failed to send message' });
    }
  });

  // ── Mark conversation as read ────────────────────────────────────────────
  app.post('/api/v1/conversations/:id/mark-read', { preHandler: requireZaloAccess('read') }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };

    await prisma.conversation.updateMany({
      where: { id, orgId: user.orgId },
      data: { unreadCount: 0 },
    });

    return { success: true };
  });

  // ── Move conversation to a different tab (main / other) ────────────────
  app.patch('/api/v1/conversations/:id/tab', { preHandler: requireZaloAccess('chat') }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    const { tab } = request.body as { tab: string };

    if (!tab || !['main', 'other'].includes(tab)) {
      return reply.status(400).send({ error: 'tab must be "main" or "other"' });
    }

    const updated = await prisma.conversation.updateMany({
      where: { id, orgId: user.orgId },
      data: { tab },
    });

    if (updated.count === 0) return reply.status(404).send({ error: 'Conversation not found' });
    return { success: true, tab };
  });

  // ── Send Voice Message (send-audio) ──────────────────────────────────────
  app.post('/api/v1/conversations/:id/send-audio', { preHandler: requireZaloAccess('chat') }, async (request: FastifyRequest, reply: FastifyReply) => {
    logger.info('[send-audio] ▶ Request received');
    const user = request.user!;
    const { id } = request.params as { id: string };
    logger.info(`[send-audio] User=${user.id}, ConvId=${id}, ContentType=${request.headers['content-type']}`);

    const { sendVoiceFile } = await import('../../shared/voice-sender.js');
    const { convertToM4a } = await import('../../shared/utils/audio-converter.js');
    const path = await import('node:path');
    const fs = await import('node:fs/promises');
    const { randomUUID } = await import('node:crypto');
    const { createWriteStream } = await import('node:fs');
    const { pipeline } = await import('node:stream/promises');
    const { config } = await import('../../config/index.js');

    logger.info('[send-audio] Starting multipart parse...');
    const parts = request.parts();
    let tempPath = '';
    let ext = '.webm';
    let originalMime = '';
    let durationMs = 0;

    for await (const part of parts) {
      if (part.type === 'file') {
        originalMime = part.mimetype;
        const mimeMap: Record<string, string> = {
          'audio/webm': '.webm',
          'audio/webm;codecs=opus': '.webm',
          'audio/ogg': '.ogg',
          'audio/ogg;codecs=opus': '.ogg',
          'audio/mp3': '.mp3',
          'audio/mpeg': '.mp3',
          'audio/wav': '.wav',
          'audio/m4a': '.m4a',
          'audio/x-m4a': '.m4a',
          'audio/mp4': '.m4a',
          'audio/aac': '.aac'
        };
        ext = mimeMap[originalMime] || path.extname(part.filename).toLowerCase() || '.webm';
        if (ext === '.weba') ext = '.webm';

        const audioDir = path.join(config.uploadDir, 'audio');
        await fs.mkdir(audioDir, { recursive: true });

        tempPath = path.join(audioDir, `${randomUUID()}${ext}`);
        await pipeline(part.file, createWriteStream(tempPath));
      } else if (part.type === 'field' && part.fieldname === 'duration') {
        durationMs = parseInt(part.value as string) || 0;
      }
    }

    if (!tempPath) return reply.status(400).send({ error: 'Missing audio file' });

    const conversation = await prisma.conversation.findFirst({
      where: { id, orgId: user.orgId },
      include: { zaloAccount: true },
    });
    if (!conversation) return reply.status(404).send({ error: 'Conversation not found' });
    if (!conversation.zaloAccountId || !conversation.zaloAccount) {
      await fs.unlink(tempPath).catch(() => {});
      return reply.status(400).send({ error: 'Voice messages are only supported for connected personal Zalo accounts' });
    }

    const instance = zaloPool.getInstance(conversation.zaloAccountId);
    if (!instance?.api) return reply.status(400).send({ error: 'Zalo account not connected' });

    const limits = await zaloRateLimiter.checkLimits(conversation.zaloAccountId);
    if (!limits.allowed) {
      return reply.status(429).send({ error: limits.reason });
    }

    let finalPath = tempPath;
    let finalMime = originalMime;
    
    try {

      // 7. Convert bằng ffmpeg nếu file là webm/ogg
      if (ext === '.webm' || ext === '.ogg') {
        try {
          finalPath = await convertToM4a(tempPath);
          finalMime = 'audio/mp4';
        } catch (convertErr: any) {
          await fs.unlink(tempPath).catch(() => {});
          return reply.status(500).send({ error: convertErr.message });
        }
      }

      const threadId = conversation.externalThreadId || '';
      const threadType = conversation.threadType === 'group' ? 1 : 0;

      const stat = await fs.stat(finalPath);
      const fileName = path.basename(finalPath);
      const fileUrl = `/api/v1/files/audio/${fileName}`;
      const publicVoiceUrl = new URL(fileUrl, config.appUrl).toString();

      if (!publicVoiceUrl.startsWith('https://')) {
        throw new Error('APP_URL must be a public HTTPS URL so Zalo can download voice messages');
      }

      zaloRateLimiter.recordSend(conversation.zaloAccountId);
      const result = await sendVoiceFile({
        api: instance.api,
        threadId,
        threadType,
        audioPath: finalPath,
        voiceUrl: publicVoiceUrl,
      });

      const sendResult = result.data as any;
      const zaloMsgId = String(sendResult?.msgId || sendResult?.data?.msgId || '');

      const message = await prisma.message.create({
        data: {
          id: randomUUID(),
          orgId: user.orgId,
          conversationId: id,
          zaloMsgId: zaloMsgId || null,
          senderType: 'self',
          senderUid: conversation.zaloAccount.zaloUid || '',
          senderName: 'Staff',
          content: '[Tin nhắn thoại]',
          contentType: 'voice',
          fileUrl,
          fileName,
          mimeType: finalMime,
          duration: durationMs || null,
          size: stat.size,
          sentAt: new Date(),
          repliedByUserId: user.id,
        },
      });

      await prisma.conversation.update({
        where: { orgId: user.orgId, id },
        data: { lastMessageAt: new Date(), isReplied: true, unreadCount: 0, aiPaused: true },
      });

      const io = (app as any).io as Server;
      await emitToConversationRooms(io, id, user.orgId, 'chat:ai-status', { conversationId: id, aiPaused: true });
      // Emit đúng tới user room của các user có quyền trong ZaloAccountAccess
      await emitToConversationRooms(io, id, user.orgId, 'chat:message', { accountId: conversation.zaloAccountId, message, conversationId: id });

      return message;
    } catch (err: any) {
      fs.unlink(tempPath).catch(() => {});
      if (finalPath !== tempPath) fs.unlink(finalPath).catch(() => {});
      logger.error('[chat] Send audio error:', err);
      return reply.status(500).send({ error: err.message || 'Failed to send voice message' });
    }
  });

  // ── Send File / Image Message ────────────────────────────────────────────
  app.post('/api/v1/conversations/:id/file', { preHandler: requireZaloAccess('chat') }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };
    
    // Allow multiple files? fastify-multipart request.files()
    const parts = request.files();
    if (!parts) return reply.status(400).send({ error: 'Missing files' });

    const conversation = await prisma.conversation.findFirst({
      where: { id, orgId: user.orgId },
      include: { zaloAccount: true },
    });
    if (!conversation) return reply.status(404).send({ error: 'Conversation not found' });
    if (!conversation.zaloAccountId || !conversation.zaloAccount) {
      return reply.status(400).send({ error: 'Files and videos are only supported for connected personal Zalo accounts' });
    }
    const zaloAccountId = conversation.zaloAccountId;

    const instance = zaloPool.getInstance(zaloAccountId);
    if (!instance?.api) return reply.status(400).send({ error: 'Zalo account not connected' });

    const limits = await zaloRateLimiter.checkLimits(zaloAccountId);
    if (!limits.allowed) {
      return reply.status(429).send({ error: limits.reason });
    }

    const { zaloOps } = await import('../../shared/zalo-operations.js');
    const { compressVideoForChat, sendNativeVideo } = await import('../../shared/video-processor.js');
    const path = await import('node:path');
    const fs = await import('node:fs/promises');
    const { randomUUID } = await import('node:crypto');
    const { createWriteStream } = await import('node:fs');
    const { pipeline } = await import('node:stream/promises');
    const { config } = await import('../../config/index.js');

    const tempPaths: string[] = [];
    const uploadedParts: Array<{ path: string; mimeType: string; originalName: string }> = [];

    try {
      for await (const part of parts) {
        let ext = path.extname(part.filename).toLowerCase();
        if (!ext && part.mimetype.startsWith('image/')) ext = '.jpg';
        if (!ext && part.mimetype.startsWith('video/')) ext = '.mp4';
        const targetDir = part.mimetype.startsWith('video/')
          ? path.join(config.uploadDir, 'video')
          : config.uploadDir;
        await fs.mkdir(targetDir, { recursive: true });
        const tempPath = path.join(targetDir, `${randomUUID()}${ext}`);
        await pipeline(part.file, createWriteStream(tempPath));
        tempPaths.push(tempPath);
        uploadedParts.push({ path: tempPath, mimeType: part.mimetype, originalName: part.filename });
      }

      if (tempPaths.length === 0) return reply.status(400).send({ error: 'No files uploaded' });

      const threadId = conversation.externalThreadId || '';
      const threadType = conversation.threadType === 'group' ? 1 : 0;
      const isSingleVideo = uploadedParts.length === 1 && uploadedParts[0]!.mimeType.startsWith('video/');

      zaloRateLimiter.recordSend(zaloAccountId);
      
      const io = (app as any).io as Server;
      if (isSingleVideo) {
        const source = uploadedParts[0]!;
        const compressedPath = path.join(config.uploadDir, 'video', `${randomUUID()}.mp4`);
        const metadata = await compressVideoForChat(source.path, compressedPath);
        const stat = await fs.stat(compressedPath);

        const result = await sendNativeVideo({
          api: instance.api,
          threadId,
          threadType,
          videoPath: compressedPath,
        });
        const sendResult = result as any;
        const zaloMsgId = String(sendResult?.msgId || sendResult?.data?.msgId || '');
        const fileName = path.basename(compressedPath);
        const fileUrl = `/api/v1/files/video/${fileName}`;

        await fs.unlink(source.path).catch(() => {});

        const message = await prisma.message.create({
          data: {
            id: randomUUID(),
            orgId: user.orgId,
            conversationId: id,
            zaloMsgId: zaloMsgId || null,
            senderType: 'self',
            senderUid: conversation.zaloAccount.zaloUid || '',
            senderName: 'Staff',
            content: '[Video]',
            contentType: 'video',
            fileUrl,
            fileName,
            mimeType: 'video/mp4',
            duration: metadata.durationMs || null,
            size: stat.size,
            attachments: [{
              type: 'video',
              url: fileUrl,
              payload: { url: fileUrl, duration: metadata.durationMs },
            }],
            sentAt: new Date(),
            repliedByUserId: user.id,
          },
        });

        await prisma.conversation.update({
          where: { orgId: user.orgId, id },
          data: { lastMessageAt: new Date(), isReplied: true, unreadCount: 0, aiPaused: true },
        });

        await emitToConversationRooms(io, id, user.orgId, 'chat:ai-status', { conversationId: id, aiPaused: true });
        await emitToConversationRooms(io, id, user.orgId, 'chat:message', { accountId: zaloAccountId, message, conversationId: id });

        return message;
      }

      if (uploadedParts.some((part) => part.mimeType.startsWith('video/'))) {
        for (const tempPath of tempPaths) {
          fs.unlink(tempPath).catch(() => {});
        }
        return reply.status(400).send({ error: 'Vui lòng gửi từng video một, không gửi chung video với ảnh/tập tin khác.' });
      }

      const result = await zaloOps.sendImage(
        zaloAccountId,
        threadId,
        threadType,
        tempPaths,
        io
      );

      // Clean up files
      for (const tempPath of tempPaths) {
        fs.unlink(tempPath).catch(err => logger.error('Failed to clean up file:', err));
      }

      const sendResult = result as any;
      const zaloMsgId = String(sendResult?.msgId || sendResult?.data?.msgId || '');

      const message = await prisma.message.create({
        data: {
          id: randomUUID(),
          orgId: user.orgId,
          conversationId: id,
          zaloMsgId: zaloMsgId || null,
          senderType: 'self',
          senderUid: conversation.zaloAccount.zaloUid || '',
          senderName: 'Staff',
          content: `[Gửi ${tempPaths.length} tập tin]`,
          contentType: 'image',
          sentAt: new Date(),
          repliedByUserId: user.id,
        },
      });

      await prisma.conversation.update({
        where: { orgId: user.orgId, id },
        data: { lastMessageAt: new Date(), isReplied: true, unreadCount: 0, aiPaused: true },
      });

      await emitToConversationRooms(io, id, user.orgId, 'chat:ai-status', { conversationId: id, aiPaused: true });
      await emitToConversationRooms(io, id, user.orgId, 'chat:message', { accountId: zaloAccountId, message, conversationId: id });

      return message;
    } catch (err: any) {
      for (const tempPath of tempPaths) {
        fs.unlink(tempPath).catch(() => {});
      }
      logger.error('[chat] Send file error:', err);
      return reply.status(500).send({ error: err.message || 'Failed to send files' });
    }
  });

  // ── AI Handover & Status Controls ──────────────────────────────────────────
  app.post('/api/v1/conversations/:id/ai/pause', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };

    const conversation = await prisma.conversation.findFirst({
      where: { id, orgId: user.orgId }
    });
    if (!conversation) return reply.status(404).send({ error: 'Conversation not found' });

    await prisma.conversation.update({
      where: { orgId: user.orgId, id },
      data: { aiPaused: true }
    });

    const io = (app as any).io as Server;
    await emitToConversationRooms(io, id, user.orgId, 'chat:ai-status', { conversationId: id, aiPaused: true });

    return { success: true, aiPaused: true };
  });

  app.post('/api/v1/conversations/:id/ai/resume', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };

    const conversation = await prisma.conversation.findFirst({
      where: { id, orgId: user.orgId }
    });
    if (!conversation) return reply.status(404).send({ error: 'Conversation not found' });

    await prisma.conversation.update({
      where: { orgId: user.orgId, id },
      data: { aiPaused: false }
    });

    const io = (app as any).io as Server;
    await emitToConversationRooms(io, id, user.orgId, 'chat:ai-status', { conversationId: id, aiPaused: false });

    return { success: true, aiPaused: false };
  });

  app.post('/api/v1/conversations/:id/ai/handover', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const { id } = request.params as { id: string };

    const conversation = await prisma.conversation.findFirst({
      where: { id, orgId: user.orgId }
    });
    if (!conversation) return reply.status(404).send({ error: 'Conversation not found' });

    // 1. Pause AI
    await prisma.conversation.update({
      where: { orgId: user.orgId, id },
      data: { aiPaused: true }
    });

    // 2. Attach 'Cần nhân viên xử lý' Tag to the contact if contactId exists
    const contactId = conversation.contactId;
    if (contactId) {
      let tag = await prisma.tag.findFirst({
        where: { orgId: user.orgId, name: 'Cần nhân viên xử lý', isActive: true }
      });
      if (!tag) {
        tag = await prisma.tag.create({
          data: {
            orgId: user.orgId,
            name: 'Cần nhân viên xử lý',
            color: '#F44336',
            description: 'Bàn giao từ AI'
          }
        });
      }

      const existingMapping = await prisma.contactTag.findFirst({
        where: { contactId, tagId: tag.id }
      });
      if (!existingMapping) {
        await prisma.contactTag.create({
          data: { orgId: user.orgId, contactId, tagId: tag.id }
        });

        try {
          const { triggerTagAutomation } = await import('../contacts/contact-sub-resource-routes.js');
          await triggerTagAutomation(user.orgId, contactId, tag.id);
        } catch (autoErr) {
          logger.error('[automation] Error triggering automation on AI handover:', autoErr);
        }

        // Update Contact's JSON tags array
        const contact = await prisma.contact.findUnique({
          where: { id: contactId },
          select: { tags: true }
        });
        let currentTags: string[] = [];
        if (contact?.tags && Array.isArray(contact.tags)) {
          currentTags = contact.tags as string[];
        }
        if (!currentTags.includes('Cần nhân viên xử lý')) {
          currentTags.push('Cần nhân viên xử lý');
          await prisma.contact.update({
            where: { id: contactId },
            data: { tags: currentTags }
          });
        }

        const { zaloPool } = await import('../zalo/zalo-pool.js');
        if (zaloPool.io) {
          const { emitToContactRooms } = await import('../../shared/utils/permission-scope.js');
          const updatedContact = await prisma.contact.findUnique({
            where: { id: contactId },
            include: {
              assignedUser: { select: { id: true, fullName: true, email: true } },
              appointments: { orderBy: { appointmentDate: 'desc' }, take: 10 },
              contactTags: { include: { tag: true } },
              _count: { select: { conversations: true } },
            }
          });
          if (updatedContact) {
            emitToContactRooms(zaloPool.io, contactId, user.orgId, 'contact:update', updatedContact);
          }
        }
      }
    }

    const io = (app as any).io as Server;
    await emitToConversationRooms(io, id, user.orgId, 'chat:ai-status', { conversationId: id, aiPaused: true });

    return { success: true, aiPaused: true };
  });
}
