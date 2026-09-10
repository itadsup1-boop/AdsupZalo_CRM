import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from '../config/index.js';
import { compressVideoForChat } from './video-processor.js';
import { logger } from './utils/logger.js';

const MAX_VIDEO_BYTES = 80 * 1024 * 1024;
const ALLOWED_ZALO_VIDEO_HOSTS = [
  'zdn.vn',
  'zadn.vn',
  'zalo.me',
  'zaloapp.com',
  'zaloapp.vn',
];

function isAllowedZaloVideoUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    return url.protocol === 'https:' && ALLOWED_ZALO_VIDEO_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

export async function cacheIncomingVideo(sourceUrl: string): Promise<{
  fileUrl: string;
  mimeType: string;
  size: number;
  duration?: number;
}> {
  if (!isAllowedZaloVideoUrl(sourceUrl)) {
    let host = 'unknown';
    try {
      host = new URL(sourceUrl).hostname;
    } catch {}
    throw new Error(`Unsupported incoming video host: ${host}`);
  }

  const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Video download failed with HTTP ${response.status}`);

  const declaredSize = Number(response.headers.get('content-length') || 0);
  if (declaredSize > MAX_VIDEO_BYTES) throw new Error('Incoming video file is too large');

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_VIDEO_BYTES) {
    throw new Error('Incoming video file is empty or too large');
  }

  const videoDir = path.join(config.uploadDir, 'video');
  await fs.mkdir(videoDir, { recursive: true });
  const inputPath = path.join(videoDir, `${randomUUID()}-source`);
  const outputPath = path.join(videoDir, `${randomUUID()}.mp4`);
  await fs.writeFile(inputPath, bytes);

  try {
    const metadata = await compressVideoForChat(inputPath, outputPath);
    const stat = await fs.stat(outputPath);
    return {
      fileUrl: `/api/v1/files/video/${path.basename(outputPath)}`,
      mimeType: 'video/mp4',
      size: stat.size,
      duration: metadata.durationMs,
    };
  } catch (error) {
    await fs.unlink(outputPath).catch(() => {});
    logger.warn('[incoming-video] Failed to cache video:', error);
    throw error;
  } finally {
    await fs.unlink(inputPath).catch(() => {});
  }
}
