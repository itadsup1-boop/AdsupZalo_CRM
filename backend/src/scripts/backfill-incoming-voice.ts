import { prisma } from '../shared/database/prisma-client.js';
import { cacheIncomingVoice } from '../shared/incoming-voice-cache.js';
import { logger } from '../shared/utils/logger.js';
import { config } from '../config/index.js';
import { convertToMp3 } from '../shared/utils/audio-converter.js';
import fs from 'node:fs/promises';
import path from 'node:path';

async function main() {
  const messages = await prisma.message.findMany({
    where: {
      contentType: 'voice',
      OR: [
        { fileUrl: { startsWith: 'https://' } },
        { fileUrl: { startsWith: 'http://' } },
        { fileUrl: { endsWith: '.m4a' } },
        { mimeType: 'audio/m4a' },
      ],
    },
    select: { id: true, fileUrl: true, duration: true },
  });

  let updated = 0;
  for (const message of messages) {
    if (!message.fileUrl) continue;
    try {
      let cached;
      if (message.fileUrl.startsWith('https://')) {
        cached = await cacheIncomingVoice(message.fileUrl);
      } else {
        const localPath = path.join(config.uploadDir, message.fileUrl.replace('/api/v1/files/', ''));
        await fs.access(localPath);
        const outputPath = await convertToMp3(localPath);
        const stat = await fs.stat(outputPath);
        cached = {
          fileUrl: `/api/v1/files/audio/${path.basename(outputPath)}`,
          mimeType: 'audio/mpeg',
          size: stat.size,
        };
      }
      await prisma.message.update({
        where: { id: message.id },
        data: {
          fileUrl: cached.fileUrl,
          mimeType: cached.mimeType,
          size: cached.size,
          attachments: [{
            type: 'audio',
            url: cached.fileUrl,
            payload: { url: cached.fileUrl, duration: message.duration },
          }],
        },
      });
      updated++;
    } catch (error) {
      logger.warn(`[voice-backfill] Failed message ${message.id}:`, error);
    }
  }

  logger.info(`[voice-backfill] Updated ${updated}/${messages.length} incoming voice messages`);
}

main()
  .catch((error) => {
    logger.error('[voice-backfill] Failed:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
