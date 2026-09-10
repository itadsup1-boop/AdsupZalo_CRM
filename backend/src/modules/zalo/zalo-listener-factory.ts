/**
 * zalo-listener-factory.ts — sets up zca-js listener events for one Zalo account.
 * Handles message routing, user-info caching, group detection, and undo events.
 * Extracted from ZaloAccountPool to keep zalo-pool.ts under 200 lines.
 */
import type { Server } from 'socket.io';
import { prisma } from '../../shared/database/prisma-client.js';
import { emitToConversationRooms } from '../../shared/utils/permission-scope.js';
import { logger } from '../../shared/utils/logger.js';
import { cacheIncomingVoice } from '../../shared/incoming-voice-cache.js';
import { cacheIncomingVideo } from '../../shared/incoming-video-cache.js';
import { handleIncomingMessage, handleMessageUndo } from '../chat/message-handler.js';
import { detectContentType, extractAlbumInfo, extractMessageMedia, updateContactAvatar } from './zalo-message-helpers.js';

// Cached user info entry with 5-minute TTL
export interface UserInfoCacheEntry {
  zaloName: string;
  avatar: string;
  phone?: string;
  cachedAt: number;
}

const USER_INFO_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Fetch zaloName + avatar from API with a per-pool in-memory cache
async function resolveZaloName(
  api: any,
  uid: string,
  cache: Map<string, UserInfoCacheEntry>,
): Promise<{ zaloName: string; avatar: string }> {
  const cached = cache.get(uid);
  if (cached && Date.now() - cached.cachedAt < USER_INFO_CACHE_TTL_MS) {
    return { zaloName: cached.zaloName, avatar: cached.avatar };
  }

  try {
    const result = await api.getUserInfo(uid);
    const profiles = result?.changed_profiles || {};
    const profile = profiles[uid] || profiles[`${uid}_0`];
    if (profile) {
      const entry: UserInfoCacheEntry = {
        zaloName:
          profile.zaloName ||
          profile.zalo_name ||
          profile.displayName ||
          profile.display_name ||
          '',
        avatar: profile.avatar || '',
        phone: profile.phoneNumber || '',
        cachedAt: Date.now(),
      };
      cache.set(uid, entry);
      return { zaloName: entry.zaloName, avatar: entry.avatar };
    }
  } catch (err) {
    logger.warn(`[zalo] getUserInfo failed for ${uid}:`, err);
  }
  return { zaloName: '', avatar: '' };
}

// Fetch group display name from the zca-js API
async function resolveGroupName(api: any, groupId: string): Promise<string> {
  try {
    const result = await api.getGroupInfo(groupId);
    const info = result?.gridInfoMap?.[groupId];
    return info?.name || '';
  } catch (err) {
    logger.warn(`[zalo] getGroupInfo failed for ${groupId}:`, err);
    return '';
  }
}

export interface ListenerContext {
  accountId: string;
  orgId: string;
  api: any;
  io: Server | null;
  userInfoCache: Map<string, UserInfoCacheEntry>;
  zaloUid?: string;
  onConnected?: (accountId: string) => void;
  onDisconnected: (accountId: string) => void;
}

/**
 * Attach all zca-js listener events for the given account.
 * Calls listener.start() with retryOnClose at the end.
 */
export function attachZaloListener(ctx: ListenerContext): void {
  const { accountId, orgId, api, io, userInfoCache, zaloUid: ctxZaloUid, onConnected, onDisconnected } = ctx;
  const currentZaloUid = ctxZaloUid || api.me?.uid;
  const listener = api.listener;

  listener.on('connected', () => {
    logger.info(`[zalo:${accountId}] Listener connected`);
    if (onConnected) {
      onConnected(accountId);
    }
  });

  listener.on('message', async (message: any) => {
    try {
      // ThreadType in zca-js: 0 = User, 1 = Group
      const isGroup = message.type === 1;
      const senderUid = String(message.data?.uidFrom || '');
      const isSelf = message.isSelf || (senderUid && currentZaloUid && String(senderUid) === String(currentZaloUid));

      if (isSelf || message.isSelf) {
        logger.info(`[zalo:${accountId}] Self message detected: senderUid=${senderUid}, currentZaloUid=${currentZaloUid}, isSelf=${message.isSelf}`);
      } else if (senderUid) {
        logger.debug(`[zalo:${accountId}] Incoming message: senderUid=${senderUid}, currentZaloUid=${currentZaloUid}`);
      }

      // Resolve display name — prefer zaloName from API over dName
      let senderName: string = message.data?.dName || '';
      if (senderUid && api.getUserInfo) {
        // For self messages, resolve recipient name using threadId
        // For contact messages, resolve sender name using senderUid
        const resolveUid = message.isSelf ? (message.threadId || '') : senderUid;
        if (resolveUid) {
          const userInfo = await resolveZaloName(api, resolveUid, userInfoCache);
          if (!message.isSelf) {
            if (userInfo.zaloName) senderName = userInfo.zaloName;
            if (userInfo.avatar) updateContactAvatar(senderUid, userInfo.avatar);
          }
        }
      }

      // Resolve group name for group threads
      let groupName: string | undefined;
      if (isGroup && message.threadId) {
        groupName = await resolveGroupName(api, message.threadId);
      }

      const rawContent = message.data?.content;
      const contentType = detectContentType(message.data?.msgType, rawContent);
      
      const isSuspicious = typeof rawContent === 'string' && rawContent.includes('sendBubbleMessage');
      if (isSuspicious) {
        logger.info(`[zalo:${accountId}] Suspicious message content detected:`, JSON.stringify(message, null, 2));
      }
      
      let content = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent || '');
      
      // Hiển thị nhãn thân thiện cho các loại tin nhắn đặc biệt
      if (contentType === 'call' || content === 'sendBubbleMessage') {
        content = '📞 Cuộc gọi đến';
      }

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
          logger.warn(`[zalo:${accountId}] Could not cache incoming voice, using Zalo URL:`, error);
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
          logger.warn(`[zalo:${accountId}] Could not cache incoming video, using Zalo URL:`, error);
        }
      }

      const result = await handleIncomingMessage({
        accountId,
        senderUid,
        senderName,
        content,
        contentType,
        msgId: String(message.data?.msgId || ''),
        timestamp: parseInt(message.data?.ts || String(Date.now())),
        isSelf: isSelf,
        threadId: message.threadId || '',
        threadType: isGroup ? 'group' : 'user',
        groupName,
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
      });

      if (result) {
        // Scoped to target rooms — prevents cross-tenant message leakage
        await emitToConversationRooms(io, result.conversationId, orgId, 'chat:message', {
          accountId,
          message: result.message,
          conversationId: result.conversationId,
        });
      }
    } catch (err) {
      logger.error(`[zalo:${accountId}] Message handler error:`, err);
    }
  });

  listener.on('undo', async (data: any) => {
    const msgId = data.data?.msgId || data.msgId;
    if (msgId) {
      const msg = await prisma.message.findFirst({
        where: { zaloMsgId: String(msgId), orgId },
        select: { conversationId: true }
      });
      await handleMessageUndo(accountId, String(msgId));
      if (msg?.conversationId) {
        await emitToConversationRooms(io, msg.conversationId, orgId, 'chat:deleted', { accountId, msgId: String(msgId) });
      }
    }
  });

  // Backfill messages delivered on reconnect (missed while disconnected)
  listener.on('old_messages', async (messages: any[], type: number) => {
    const threadType = type === 1 ? 'group' : 'user';
    logger.info(`[zalo:${accountId}] Received ${messages.length} old ${threadType} messages`);

    for (const message of messages) {
      try {
        const senderUid = String(message.data?.uidFrom || '');
        const isSelf = message.isSelf || (senderUid && currentZaloUid && String(senderUid) === String(currentZaloUid));
        let senderName = message.data?.dName || '';

        // Resolve display name for non-self messages
        if (!message.isSelf && senderUid && api.getUserInfo) {
          const userInfo = await resolveZaloName(api, senderUid, userInfoCache);
          if (userInfo.zaloName) senderName = userInfo.zaloName;
        }

        let groupName: string | undefined;
        if (threadType === 'group' && message.threadId) {
          groupName = await resolveGroupName(api, message.threadId);
        }

        const rawContent = message.data?.content;
        const content =
          typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent || '');
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
            logger.warn(`[zalo:${accountId}] Could not cache old voice, using Zalo URL:`, error);
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
            logger.warn(`[zalo:${accountId}] Could not cache old video, using Zalo URL:`, error);
          }
        }

        const result = await handleIncomingMessage({
          accountId,
          senderUid,
          senderName,
          content,
          contentType,
          msgId: String(message.data?.msgId || ''),
          timestamp: parseInt(message.data?.ts || String(Date.now())),
          isSelf: isSelf,
          threadId: message.threadId || '',
          threadType,
          groupName,
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

        if (result) {
          await emitToConversationRooms(io, result.conversationId, orgId, 'chat:message', {
            accountId,
            message: result.message,
            conversationId: result.conversationId,
          });
        }
      } catch (err) {
        logger.warn(`[zalo:${accountId}] old_messages processing error:`, err);
      }
    }
  });

  // Group system events: member join/leave/kick, name change, etc.
  listener.on('group_event', (event: any) => {
    logger.info(`[zalo:${accountId}] Group event: type=${event?.type ?? 'unknown'}`, {
      groupId: event?.groupId,
      actorId: event?.actorId,
      members: event?.members,
    });
    // Future: store as system message in the group conversation
  });

  // Friend lifecycle events: request sent/accepted/blocked
  listener.on('friend_event', (event: any) => {
    logger.info(`[zalo:${accountId}] Friend event: type=${event?.type ?? 'unknown'}`, {
      fromId: event?.fromId,
      toId: event?.toId,
    });
    // Future: update contact status based on friend_event type
  });

  listener.on('closed', (code: number, reason: string) => {
    logger.warn(`[zalo:${accountId}] Listener closed: ${code} ${reason}`);
    onDisconnected(accountId);
  });

  listener.on('error', (err: any) => {
    logger.error(`[zalo:${accountId}] Listener error:`, err);
  });

  listener.start({ retryOnClose: true });
}
