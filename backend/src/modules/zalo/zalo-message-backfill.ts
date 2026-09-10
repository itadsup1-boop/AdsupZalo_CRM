import { randomUUID } from 'node:crypto';
import { prisma } from '../../shared/database/prisma-client.js';
import { getTenantPrisma } from '../../shared/database/prisma-tenant.js';
import { logger } from '../../shared/utils/logger.js';
import { cacheIncomingVoice } from '../../shared/incoming-voice-cache.js';
import { cacheIncomingVideo } from '../../shared/incoming-video-cache.js';
import { handleIncomingMessage } from '../chat/message-handler.js';
import { detectContentType, extractAlbumInfo, extractMessageMedia } from './zalo-message-helpers.js';

const THREAD_TYPE_USER = 0;
const THREAD_TYPE_GROUP = 1;
const DEFAULT_LOOKBACK_MS = 24 * 60 * 60_000;
const SAFETY_OVERLAP_MS = 30 * 60_000;
const DEFAULT_GROUP_HISTORY_LIMIT = 100;
const MAX_CONVERSATIONS_PER_RUN = 80;

export interface ZaloBackfillStats {
  accountId: string;
  conversationsScanned: number;
  messagesImported: number;
  duplicatesSkipped: number;
  errors: Array<{ conversationId?: string; threadId?: string; error: string }>;
  wsRequests: number;
}

function extractMessages(history: any): any[] {
  if (!history) return [];
  if (Array.isArray(history)) return history;
  return history.groupMsgs || history.data?.groupMsgs || history.msgs || history.data?.msgs || [];
}

function messageTimestamp(message: any): number {
  const raw = message?.data?.ts || message?.ts || message?.timestamp;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

async function setSyncState(
  db: any,
  input: {
    orgId: string;
    accountId: string;
    conversationId: string;
    status: string;
    error?: string | null;
  },
): Promise<void> {
  const existing = await db.zaloConversationSyncState.findFirst({
    where: { orgId: input.orgId, zaloAccountId: input.accountId, conversationId: input.conversationId },
    select: { id: true },
  });

  const data = {
    syncStatus: input.status,
    lastBackfillAt: new Date(),
    lastError: input.error ? input.error.slice(0, 1000) : null,
    updatedAt: new Date(),
  };

  if (existing) {
    await db.zaloConversationSyncState.update({ where: { id: existing.id }, data });
    return;
  }

  await db.zaloConversationSyncState.create({
    data: {
      id: randomUUID(),
      orgId: input.orgId,
      zaloAccountId: input.accountId,
      conversationId: input.conversationId,
      ...data,
    },
  });
}

async function importZaloMessage(input: {
  accountId: string;
  threadId: string;
  threadType: 'user' | 'group';
  message: any;
}): Promise<'imported' | 'duplicate'> {
  const { accountId, threadId, threadType, message } = input;
  const rawContent = message.data?.content;
  const content = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent || '');
  const contentType = detectContentType(message.data?.msgType, rawContent);
  const album = extractAlbumInfo(contentType, rawContent);
  const media = extractMessageMedia(contentType, rawContent);

  if (contentType === 'voice' && media.fileUrl) {
    try {
      const cached = await cacheIncomingVoice(media.fileUrl);
      media.fileUrl = cached.fileUrl;
      media.mimeType = cached.mimeType;
      media.size = cached.size;
      media.attachments = [{ type: 'audio', url: cached.fileUrl, payload: { url: cached.fileUrl, duration: media.duration } }];
    } catch (error) {
      logger.warn(`[backfill:${accountId}] Could not cache voice, using Zalo URL:`, error);
    }
  } else if (contentType === 'video' && media.fileUrl) {
    try {
      const cached = await cacheIncomingVideo(media.fileUrl);
      media.fileUrl = cached.fileUrl;
      media.mimeType = cached.mimeType;
      media.size = cached.size;
      media.duration = cached.duration ?? media.duration;
      media.attachments = [{ type: 'video', url: cached.fileUrl, payload: { url: cached.fileUrl, duration: media.duration } }];
    } catch (error) {
      logger.warn(`[backfill:${accountId}] Could not cache video, using Zalo URL:`, error);
    }
  }

  const msgId = String(message.data?.msgId || message.data?.cliMsgId || message.msgId || '');
  const result = await handleIncomingMessage({
    accountId,
    senderUid: String(message.data?.uidFrom || message.uidFrom || ''),
    senderName: message.data?.dName || message.dName || '',
    content,
    contentType,
    msgId: msgId || `backfill-${randomUUID()}`,
    timestamp: messageTimestamp(message),
    isSelf: Boolean(message.isSelf),
    threadId,
    threadType,
    attachments: media.attachments,
    fileUrl: media.fileUrl,
    fileName: media.fileName,
    mimeType: media.mimeType,
    duration: media.duration,
    size: media.size,
    quote: message.data?.quote,
    albumKey: album.albumKey,
    albumIndex: album.albumIndex,
    albumTotal: album.albumTotal,
    isBackfill: true,
  });

  return result ? 'imported' : 'duplicate';
}

async function ensureGroupConversations(accountId: string, orgId: string, api: any): Promise<number> {
  const db = getTenantPrisma(orgId);
  let created = 0;

  try {
    const groupResult = await api.getAllGroups?.();
    const gridVerMap = groupResult?.gridVerMap || {};
    const groupIds = Object.keys(gridVerMap);
    if (groupIds.length === 0) return 0;

    const infoRes = await api.getGroupInfo?.(groupIds);
    const infoMap = infoRes?.gridInfoMap || {};
    for (const group of Object.values(infoMap) as any[]) {
      const groupId = group.groupId || group.id || '';
      if (!groupId) continue;

      const existing = await db.conversation.findFirst({
        where: { zaloAccountId: accountId, externalThreadId: groupId },
        select: { id: true },
      });
      if (existing) continue;

      await db.conversation.create({
        data: {
          id: randomUUID(),
          orgId,
          zaloAccountId: accountId,
          externalThreadId: groupId,
          threadType: 'group',
          lastMessageAt: new Date('2000-01-01'),
        },
      });
      created++;
    }
  } catch (err) {
    logger.warn(`[backfill:${accountId}] Failed to ensure group conversations:`, err);
  }

  return created;
}

export async function runZaloMessageBackfill(input: {
  accountId: string;
  orgId?: string;
  api: any;
  since?: Date;
  lookbackHours?: number;
  requestOldMessages?: boolean;
  conversationId?: string;
  reason?: string;
}): Promise<ZaloBackfillStats> {
  const account = input.orgId
    ? { orgId: input.orgId }
    : await prisma.zaloAccount.findUnique({
        where: { id: input.accountId },
        select: { orgId: true },
      });
  if (!account) throw new Error('Zalo account not found');

  const orgId = account.orgId;
  const db = getTenantPrisma(orgId);
  const lookbackMs = input.lookbackHours ? input.lookbackHours * 60 * 60_000 : DEFAULT_LOOKBACK_MS;
  const accountState = await db.zaloAccount.findUnique({
    where: { id: input.accountId },
    select: { disconnectedAt: true },
  });
  const since =
    input.since ||
    (accountState?.disconnectedAt
      ? new Date(accountState.disconnectedAt.getTime() - SAFETY_OVERLAP_MS)
      : new Date(Date.now() - lookbackMs));

  const stats: ZaloBackfillStats = {
    accountId: input.accountId,
    conversationsScanned: 0,
    messagesImported: 0,
    duplicatesSkipped: 0,
    errors: [],
    wsRequests: 0,
  };

  logger.info(`[backfill:${input.accountId}] Starting message backfill`, {
    reason: input.reason || 'manual',
    since: since.toISOString(),
    conversationId: input.conversationId,
  });

  await ensureGroupConversations(input.accountId, orgId, input.api);

  if (input.requestOldMessages !== false && input.api?.listener?.requestOldMessages) {
    try {
      input.api.listener.requestOldMessages(THREAD_TYPE_USER);
      input.api.listener.requestOldMessages(THREAD_TYPE_GROUP);
      stats.wsRequests += 2;
      logger.info(`[backfill:${input.accountId}] Requested websocket old messages for user/group threads`);
    } catch (err) {
      stats.errors.push({ error: `requestOldMessages failed: ${String(err)}` });
      logger.warn(`[backfill:${input.accountId}] requestOldMessages failed:`, err);
    }
  }

  const conversations = await db.conversation.findMany({
    where: {
      zaloAccountId: input.accountId,
      ...(input.conversationId ? { id: input.conversationId } : {}),
    },
    include: { syncState: true },
    orderBy: { lastMessageAt: 'desc' },
    take: input.conversationId ? 1 : MAX_CONVERSATIONS_PER_RUN,
  });

  for (const conv of conversations) {
    if (!conv.externalThreadId) continue;
    const checkpoint = conv.syncState?.lastSyncedAt
      ? new Date(conv.syncState.lastSyncedAt.getTime() - SAFETY_OVERLAP_MS)
      : since;

    await setSyncState(db, {
        orgId,
        accountId: input.accountId,
        conversationId: conv.id,
        status: 'running',
    });

    stats.conversationsScanned++;

    try {
      if (conv.threadType !== 'group') {
        await setSyncState(db, { orgId, accountId: input.accountId, conversationId: conv.id, status: 'idle' });
        continue;
      }

      const history = await input.api.getGroupChatHistory(conv.externalThreadId, DEFAULT_GROUP_HISTORY_LIMIT);
      const messages = extractMessages(history)
        .filter((msg) => messageTimestamp(msg) >= checkpoint.getTime())
        .sort((a, b) => messageTimestamp(a) - messageTimestamp(b));

      for (const message of messages) {
        const outcome = await importZaloMessage({
          accountId: input.accountId,
          threadId: conv.externalThreadId,
          threadType: 'group',
          message,
        });
        if (outcome === 'imported') stats.messagesImported++;
        else stats.duplicatesSkipped++;
      }

      await setSyncState(db, { orgId, accountId: input.accountId, conversationId: conv.id, status: 'idle' });
    } catch (err) {
      const error = String(err);
      stats.errors.push({ conversationId: conv.id, threadId: conv.externalThreadId, error });
      await setSyncState(db, { orgId, accountId: input.accountId, conversationId: conv.id, status: 'error', error });
      logger.warn(`[backfill:${input.accountId}] Conversation ${conv.id} failed:`, err);
    }
  }

  logger.info(`[backfill:${input.accountId}] Complete`, stats);
  return stats;
}
