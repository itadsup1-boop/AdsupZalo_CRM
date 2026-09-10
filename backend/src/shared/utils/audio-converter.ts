import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs/promises';
import { logger } from './logger.js';

export async function convertToM4a(inputPath: string): Promise<string> {
  const dir = path.dirname(inputPath);
  const ext = path.extname(inputPath);
  const basename = path.basename(inputPath, ext);
  const outputPath = path.join(dir, `${basename}.m4a`);

  return new Promise((resolve, reject) => {
    logger.info(`[audio-converter] Converting ${inputPath} to ${outputPath}`);
    
    ffmpeg(inputPath)
      .toFormat('ipod') // 'ipod' is the ffmpeg format name for m4a/mp4 audio
      .audioCodec('aac')
      .audioBitrate('128k')
      .on('end', async () => {
        logger.info(`[audio-converter] Conversion successful: ${outputPath}`);
        try {
          // Xóa file tạm gốc sau khi convert thành công
          await fs.unlink(inputPath);
        } catch (err) {
          logger.warn(`[audio-converter] Failed to delete original file ${inputPath}:`, err);
        }
        resolve(outputPath);
      })
      .on('error', (err) => {
        logger.error(`[audio-converter] Conversion failed for ${inputPath}:`, err);
        reject(new Error(`Lỗi chuyển đổi file âm thanh: ${err.message}`));
      })
      .save(outputPath);
  });
}

export async function convertToMp3(inputPath: string): Promise<string> {
  const dir = path.dirname(inputPath);
  const ext = path.extname(inputPath);
  const basename = path.basename(inputPath, ext);
  const outputPath = path.join(dir, `${basename}.mp3`);

  return new Promise((resolve, reject) => {
    logger.info(`[audio-converter] Converting ${inputPath} to ${outputPath}`);
    ffmpeg(inputPath)
      .audioCodec('libmp3lame')
      .audioBitrate('96k')
      .audioChannels(1)
      .audioFrequency(44100)
      .format('mp3')
      .on('end', async () => {
        await fs.unlink(inputPath).catch((err) => {
          logger.warn(`[audio-converter] Failed to delete original file ${inputPath}:`, err);
        });
        logger.info(`[audio-converter] Conversion successful: ${outputPath}`);
        resolve(outputPath);
      })
      .on('error', (err) => {
        logger.error(`[audio-converter] Conversion failed for ${inputPath}:`, err);
        reject(new Error(`Lỗi chuyển đổi file âm thanh: ${err.message}`));
      })
      .save(outputPath);
  });
}
