import { aiConfig, isAiConfigured } from './config';
import type { ChatCompletionRequest, ChatCompletionResponse, ChatMessage } from './types';

export class AiClientError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'AiClientError';
    this.status = status;
  }
}

async function readJson(res: Response): Promise<ChatCompletionResponse> {
  const text = await res.text();
  const trimmed = text.trimStart();
  if (trimmed.startsWith('<!') || trimmed.startsWith('<html')) {
    throw new AiClientError(
      'AI proxy returned a web page instead of JSON. Refresh the app (Settings → Refresh app cache) so the latest build is loaded.',
      res.status,
    );
  }
  try {
    return JSON.parse(text) as ChatCompletionResponse;
  } catch {
    throw new AiClientError(
      text.slice(0, 240) || `AI response was not valid JSON (${res.status})`,
      res.status,
    );
  }
}

export async function createChatCompletion(
  messages: ChatMessage[],
  opts: { signal?: AbortSignal; maxTokens?: number; temperature?: number } = {},
): Promise<ChatCompletionResponse> {
  if (!isAiConfigured) {
    throw new AiClientError(
      'AI is not configured. Set VITE_AI_PROXY_URL (Cloudflare Worker) or local VITE_AI_BASE_URL + VITE_AI_API_KEY.',
    );
  }

  const body: ChatCompletionRequest = {
    model: aiConfig.model,
    messages,
    max_tokens: opts.maxTokens ?? aiConfig.maxTokens,
    temperature: opts.temperature ?? 0.3,
    stream: false,
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (aiConfig.apiKey && !aiConfig.proxyHoldsKey) {
    headers.Authorization = `Bearer ${aiConfig.apiKey}`;
  }

  const endpoint = `${aiConfig.baseUrl}/chat/completions`;

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: opts.signal,
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
    });
  } catch (error) {
    if (opts.signal?.aborted) throw error;
    throw new AiClientError(
      'Could not reach the AI service from this device. Pull to refresh or use Settings → Refresh app cache, then try again.',
    );
  }

  if (!res.ok) {
    let detail = '';
    try {
      const text = await res.text();
      if (text.trimStart().startsWith('<')) {
        detail = `AI proxy error (${res.status}). Refresh the app cache and try again.`;
      } else {
        detail = text.slice(0, 400);
      }
    } catch {
      /* ignore */
    }
    throw new AiClientError(detail || `AI request failed (${res.status})`, res.status);
  }

  return readJson(res);
}

export function assistantText(response: ChatCompletionResponse): string {
  return response.choices[0]?.message?.content?.trim() ?? '';
}
