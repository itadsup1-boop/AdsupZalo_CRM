import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

vi.mock('../src/shared/zalo-operations.js', () => ({
  ZaloOpError: class ZaloOpError extends Error {
    constructor(message: string) {
      super(message);
    }
  },
}));

import { sendVoiceFile } from '../src/shared/voice-sender.js';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })));
});

async function createAudioFile(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'voice-sender-'));
  tempDirs.push(dir);
  const audioPath = path.join(dir, 'voice.m4a');
  await fs.writeFile(audioPath, Buffer.from('audio-data'));
  return audioPath;
}

describe('sendVoiceFile', () => {
  it('passes a public voice URL using the zca-js v2 contract', async () => {
    const audioPath = await createAudioFile();
    const sendVoice = vi.fn().mockResolvedValue({ msgId: 'message-1' });

    const result = await sendVoiceFile({
      api: { sendVoice },
      threadId: 'thread-1',
      threadType: 0,
      audioPath,
      voiceUrl: 'https://crm.adsup.vn/api/v1/files/audio/voice.m4a',
    });

    expect(sendVoice).toHaveBeenCalledWith(
      { voiceUrl: 'https://crm.adsup.vn/api/v1/files/audio/voice.m4a' },
      'thread-1',
      0,
    );
    expect(result.data).toEqual({ msgId: 'message-1' });
  });

  it('rejects non-HTTPS URLs before calling Zalo', async () => {
    const audioPath = await createAudioFile();
    const sendVoice = vi.fn();

    await expect(sendVoiceFile({
      api: { sendVoice },
      threadId: 'thread-1',
      threadType: 0,
      audioPath,
      voiceUrl: 'http://localhost/audio/voice.m4a',
    })).rejects.toThrow('publicly accessible over HTTPS');

    expect(sendVoice).not.toHaveBeenCalled();
  });
});
