/**
 * zalo-message-helpers.ts — utilities for processing incoming Zalo messages.
 * Detects content type from msgType and updates contact avatars fire-and-forget.
 */
import { prisma } from '../../shared/database/prisma-client.js';
import { getTenantPrisma } from '../../shared/database/prisma-tenant.js';
import { logger } from '../../shared/utils/logger.js';

// Well-known msgType keyword patterns — used to suppress noise logging
const KNOWN_MSG_TYPE_PATTERNS = [
  'photo', 'image', 'sticker', 'video', 'voice',
  'gif', 'link', 'location', 'file', 'doc',
  'recommended', 'card', 'bank', 'transfer',
  'call', 'voip', 'qr', 'remind', 'todo',
  'poll', 'vote', 'note', 'forward',
];

/**
 * Map zca-js msgType string to a normalized content type label.
 * Falls back to 'text' for unrecognised types or plain-string content.
 */
export function detectContentType(msgType: string | undefined, content: any): string {
  if (!msgType) return 'text';
  if (msgType.includes('photo') || msgType.includes('image')) return 'image';
  if (msgType.includes('sticker')) return 'sticker';
  if (msgType.includes('video')) return 'video';
  if (msgType.includes('voice')) return 'voice';
  if (msgType.includes('gif')) return 'gif';
  if (msgType.includes('link')) return 'link';
  if (msgType.includes('location')) return 'location';
  if (msgType.includes('file') || msgType.includes('doc')) return 'file';
  if (msgType.includes('recommended') || msgType.includes('card')) return 'contact_card';

  // Special message types
  if (msgType.includes('bank') || msgType.includes('transfer')) return 'bank_transfer';
  if (msgType.includes('call') || msgType.includes('voip')) return 'call';
  if (msgType.includes('qr')) return 'qr_code';
  if (msgType.includes('remind') || msgType.includes('todo')) return 'reminder';
  if (msgType.includes('poll') || msgType.includes('vote')) return 'poll';
  if (msgType.includes('note')) return 'note';
  if (msgType.includes('forward')) return 'forwarded';

  // Check content object shape for action-based messages
  if (typeof content === 'object' && content !== null) {
    if (content.action === 'msginfo.actionlist') return 'reminder';
    if (content.bankCode || content.bankName) return 'bank_transfer';
    if (content.callDuration !== undefined || content.callType) return 'call';

    // Log unknown types for analysis before returning rich
    if (!KNOWN_MSG_TYPE_PATTERNS.some((p) => msgType.includes(p))) {
      logger.info(`[zalo:msgType] Unknown object type: "${msgType}"`, {
        contentKeys: Object.keys(content),
      });
    }
    return 'rich';
  }

  // Log unknown string-content types for discovery
  if (!KNOWN_MSG_TYPE_PATTERNS.some((p) => msgType.includes(p))) {
    logger.info(`[zalo:msgType] Unknown string type: "${msgType}"`, {
      contentPreview: typeof content === 'string' ? content.slice(0, 100) : undefined,
    });
  }

  return 'text';
}

export interface AlbumInfo {
  albumKey: string | null;
  albumIndex: number | null;
  albumTotal: number | null;
}

export interface MessageMediaInfo {
  fileUrl: string | null;
  fileName: string | null;
  mimeType: string | null;
  duration: number | null;
  size: number | null;
  attachments: Array<Record<string, unknown>>;
}

/** Extract media fields from Zalo's rich-message payload. */
export function extractMessageMedia(contentType: string, rawContent: unknown): MessageMediaInfo {
  const empty: MessageMediaInfo = {
    fileUrl: null,
    fileName: null,
    mimeType: null,
    duration: null,
    size: null,
    attachments: [],
  };
  if (typeof rawContent !== 'object' || rawContent === null) return empty;

  const content = rawContent as Record<string, unknown>;
  let params: Record<string, unknown> = {};
  try {
    params = typeof content.params === 'string'
      ? JSON.parse(content.params)
      : (content.params as Record<string, unknown> | undefined) ?? {};
  } catch {
    params = {};
  }

  const url = [params.m4a, params.url, content.href, content.url]
    .find((value): value is string => typeof value === 'string' && /^https?:\/\//i.test(value)) ?? null;
  if (!url) return empty;

  const duration = Number(params.duration ?? content.duration);
  const size = Number(params.fileSize ?? content.fileSize);
  const extension = (() => {
    try {
      return new URL(url).pathname.split('.').pop()?.toLowerCase() ?? '';
    } catch {
      return '';
    }
  })();
  const mimeByExtension: Record<string, string> = {
    aac: 'audio/aac',
    m4a: 'audio/mp4',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    webm: 'audio/webm',
    mp4: 'video/mp4',
  };
  const mimeType = mimeByExtension[extension] ?? null;

  return {
    fileUrl: url,
    fileName: typeof content.title === 'string' && content.title ? content.title : null,
    mimeType,
    duration: Number.isFinite(duration) && duration > 0 ? Math.round(duration) : null,
    size: Number.isFinite(size) && size > 0 ? Math.round(size) : null,
    attachments: [{
      type: contentType === 'voice' ? 'audio' : contentType,
      url,
      payload: { url, duration: Number.isFinite(duration) ? duration : undefined },
    }],
  };
}

/**
 * Extract multi-image album metadata from Zalo content payload.
 * Zalo tags each photo in an album with a shared group_layout_id and position.
 */
export function extractAlbumInfo(contentType: string, rawContent: unknown): AlbumInfo {
  const empty: AlbumInfo = { albumKey: null, albumIndex: null, albumTotal: null };
  if (contentType !== 'image' || typeof rawContent !== 'object' || rawContent === null) return empty;
  const paramsRaw = (rawContent as Record<string, unknown>).params;
  let params: Record<string, unknown> | null = null;
  try {
    params = typeof paramsRaw === 'string' ? JSON.parse(paramsRaw) : (paramsRaw as Record<string, unknown> | null);
  } catch {
    return empty;
  }
  if (!params || !params.is_group_layout || !params.group_layout_id) return empty;
  const idx = Number(params.id_in_group);
  const total = Number(params.total_item_in_group);
  return {
    albumKey: String(params.group_layout_id),
    albumIndex: Number.isFinite(idx) ? idx : null,
    albumTotal: Number.isFinite(total) ? total : null,
  };
}

/**
 * Fire-and-forget: fill in a missing avatarUrl on a Contact row.
 * Only updates rows where avatarUrl is currently null.
 */
export async function updateContactAvatar(zaloUid: string, avatarUrl: string): Promise<void> {
  try {
    const contacts = await prisma.contact.findMany({
      where: { zaloUid, avatarUrl: null },
      select: { orgId: true },
    });

    for (const c of contacts) {
      const db = getTenantPrisma(c.orgId);
      await db.contact.updateMany({
        where: { zaloUid },
        data: { avatarUrl },
      });
    }
  } catch (err) {
    logger.error('[zalo-message-helpers] updateContactAvatar error:', err);
  }
}
