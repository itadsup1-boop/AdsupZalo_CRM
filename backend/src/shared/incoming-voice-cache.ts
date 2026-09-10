import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from '../config/index.js';
import { convertToMp3 } from './utils/audio-converter.js';
import { logger } from './utils/logger.js';

const MAX_VOICE_BYTES = 10 * 1024 * 1024;
const ALLOWED_ZALO_VOICE_HOSTS = [
  'zdn.vn',
  'zadn.vn',
  'zalo.me',
  'zaloapp.com',
  'zaloapp.vn',
];

function isAllowedZaloVoiceUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    return url.protocol === 'https:' && ALLOWED_ZALO_VOICE_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

/** Download an incoming Zalo voice file and convert it to broadly compatible MP3. */
export async function cacheIncomingVoice(sourceUrl: string): Promise<{
  fileUrl: string;
  mimeType: string;
  size: number;
}> {
  if (!isAllowedZaloVoiceUrl(sourceUrl)) {
    let host = 'unknown';
    try {
      host = new URL(sourceUrl).hostname;
    } catch {}
    throw new Error(`Unsupported incoming voice host: ${host}`);
  }

  const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Voice download failed with HTTP ${response.status}`);

  const declaredSize = Number(response.headers.get('content-length') || 0);
  if (declaredSize > MAX_VOICE_BYTES) throw new Error('Incoming voice file is too large');

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_VOICE_BYTES) {
    throw new Error('Incoming voice file is empty or too large');
  }

  const audioDir = path.join(config.uploadDir, 'audio');
  await fs.mkdir(audioDir, { recursive: true });
  const inputPath = path.join(audioDir, `${randomUUID()}.aac`);
  await fs.writeFile(inputPath, bytes);

  try {
    const outputPath = await convertToMp3(inputPath);
    const stat = await fs.stat(outputPath);
    return {
      fileUrl: `/api/v1/files/audio/${path.basename(outputPath)}`,
      mimeType: 'audio/mpeg',
      size: stat.size,
    };
  } catch (error) {
    await fs.unlink(inputPath).catch(() => {});
    logger.warn('[incoming-voice] Failed to cache voice:', error);
    throw error;
  }
}
