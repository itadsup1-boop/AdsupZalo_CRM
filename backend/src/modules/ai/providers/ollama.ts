/**
 * Native Ollama API provider.
 * Uses POST /api/chat — compatible with Ollama and Ollama-compatible servers
 * (e.g. api.adsup.vn).
 * Auth is sent via both Authorization: Bearer and x-api-key headers for max compat.
 */
export async function generateWithOllama(
  baseUrl: string,
  apiKey: string,
  model: string,
  system: string,
  prompt: string,
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 300_000);
  try {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };
    if (apiKey && apiKey !== 'ollama') {
      headers['authorization'] = `Bearer ${apiKey}`;
      headers['x-api-key'] = apiKey;
    }

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
        stream: false,
        options: {
          temperature: 0.5,
          num_predict: 600,
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Ollama request failed ${response.status}: ${errText.slice(0, 200)}`);
    }

    const data = (await response.json()) as {
      message?: { content?: string };
      response?: string; // /api/generate fallback
    };

    const text = (data.message?.content ?? data.response ?? '').trim();
    if (!text) throw new Error('Ollama returned empty content');
    return text;
  } finally {
    clearTimeout(timeout);
  }
}
