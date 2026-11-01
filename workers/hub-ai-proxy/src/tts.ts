/**
 * Gemini TTS for Personal Hub (server-side only).
 * Mirrors the career-radar pipeline: primary model → fallback model → caller uses device voice.
 */

export interface TtsEnv {
  GEMINI_API_KEY?: string;
  GEMINI_TTS_MODEL?: string;
  GEMINI_TTS_FALLBACK_MODEL?: string;
  GEMINI_VOICE?: string;
  GEMINI_DAILY_TOKEN_LIMIT?: string;
  GEMINI_DAILY_REQUEST_LIMIT?: string;
  GEMINI_RPM?: string;
}

export interface TtsStatus {
  enabled: boolean;
  voice: string;
  model: string;
  fallbackModel: string;
  dailyRequestsLeft: number | null;
  dailyTokensLeft: number | null;
  deviceFallback: true;
}

const DEFAULT_MODEL = 'gemini-3.8-flash-tts';
const DEFAULT_FALLBACK = 'gemini-3.8-flash-lite-tts';
const DEFAULT_VOICE = 'Charon';
const MAX_CHARS = 1200;

function num(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function ttsConfig(env: TtsEnv) {
  return {
    apiKey: env.GEMINI_API_KEY?.trim() || '',
    model: env.GEMINI_TTS_MODEL?.trim() || DEFAULT_MODEL,
    fallbackModel: env.GEMINI_TTS_FALLBACK_MODEL?.trim() || DEFAULT_FALLBACK,
    voice: env.GEMINI_VOICE?.trim() || DEFAULT_VOICE,
    dailyTokenLimit: num(env.GEMINI_DAILY_TOKEN_LIMIT, 40_000),
    dailyRequestLimit: num(env.GEMINI_DAILY_REQUEST_LIMIT, 80),
    rpm: num(env.GEMINI_RPM, 8),
  };
}

export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

/** Strip markdown / action markup so TTS reads cleanly. */
export function plainForSpeech(input: string): string {
  return input
    .replace(/<hub_actions>[\s\S]*?<\/hub_actions>/gi, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_~>#-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_CHARS);
}

function dayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function minuteKey(): string {
  return new Date().toISOString().slice(0, 16);
}

async function readCounter(cache: Cache, key: string): Promise<number> {
  const hit = await cache.match(new Request(`https://hub-ai-proxy.rate/${key}`));
  if (!hit) return 0;
  const n = Number(await hit.text());
  return Number.isFinite(n) ? n : 0;
}

async function writeCounter(cache: Cache, key: string, value: number, maxAgeSec: number): Promise<void> {
  await cache.put(
    new Request(`https://hub-ai-proxy.rate/${key}`),
    new Response(String(value), {
      headers: { 'Cache-Control': `max-age=${maxAgeSec}`, 'Content-Type': 'text/plain' },
    }),
  );
}

export async function getTtsStatus(env: TtsEnv): Promise<TtsStatus> {
  const cfg = ttsConfig(env);
  const cache = caches.default;
  const day = dayKey();
  const reqUsed = await readCounter(cache, `req:${day}`);
  const tokUsed = await readCounter(cache, `tok:${day}`);
  return {
    enabled: Boolean(cfg.apiKey),
    voice: cfg.voice,
    model: cfg.model,
    fallbackModel: cfg.fallbackModel,
    dailyRequestsLeft: cfg.apiKey ? Math.max(0, cfg.dailyRequestLimit - reqUsed) : null,
    dailyTokensLeft: cfg.apiKey ? Math.max(0, cfg.dailyTokenLimit - tokUsed) : null,
    deviceFallback: true,
  };
}

export async function reserveBudget(
  env: TtsEnv,
  tokens: number,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const cfg = ttsConfig(env);
  if (!cfg.apiKey) return { ok: false, status: 503, error: 'Gemini TTS is not configured' };

  const cache = caches.default;
  const day = dayKey();
  const minute = minuteKey();
  const reqUsed = await readCounter(cache, `req:${day}`);
  const tokUsed = await readCounter(cache, `tok:${day}`);
  const rpmUsed = await readCounter(cache, `rpm:${minute}`);

  if (rpmUsed >= cfg.rpm) {
    return { ok: false, status: 429, error: 'TTS rate limit (per minute). Try again shortly, or use device voice.' };
  }
  if (reqUsed >= cfg.dailyRequestLimit) {
    return { ok: false, status: 429, error: 'Daily TTS request limit reached. Using device voice instead.' };
  }
  if (tokUsed + tokens > cfg.dailyTokenLimit) {
    return { ok: false, status: 429, error: 'Daily TTS token budget reached. Using device voice instead.' };
  }

  await writeCounter(cache, `req:${day}`, reqUsed + 1, 86_400);
  await writeCounter(cache, `tok:${day}`, tokUsed + tokens, 86_400);
  await writeCounter(cache, `rpm:${minute}`, rpmUsed + 1, 120);
  return { ok: true };
}

type VoiceMode = 'voice' | 'prebuilt';

async function callGemini(
  apiKey: string,
  model: string,
  voice: string,
  text: string,
  voiceMode: VoiceMode,
): Promise<ArrayBuffer> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const voiceConfig =
    voiceMode === 'voice'
      ? { voice }
      : { prebuiltVoiceConfig: { voiceName: voice } };

  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `Say exactly: ${text}`,
            speech_metadata: { style: 'clear, calm, concise personal assistant' },
          },
        ],
      },
    ],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig },
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(55_000),
  });

  const payload = (await res.json()) as {
    error?: { message?: string };
    candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> } }>;
  };

  if (!res.ok) {
    throw new Error(payload.error?.message || `Gemini TTS failed (${res.status})`);
  }

  const b64 = payload.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!b64) throw new Error('Gemini TTS returned no audio');

  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  // Gemini 3.x often returns a ready WAV; older models return raw PCM — detect RIFF.
  if (bytes.length >= 4 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
    return bytes.buffer;
  }
  return pcm16ToWav(bytes, 24_000).buffer;
}

function pcm16ToWav(pcm: Uint8Array, sampleRate: number): Uint8Array {
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + pcm.length, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, pcm.length, true);
  const out = new Uint8Array(44 + pcm.length);
  out.set(new Uint8Array(header), 0);
  out.set(pcm, 44);
  return out;
}

export async function synthesizeSpeech(
  env: TtsEnv,
  text: string,
): Promise<{ ok: true; audio: ArrayBuffer; contentType: string } | { ok: false; status: number; error: string }> {
  const cfg = ttsConfig(env);
  const cleaned = plainForSpeech(text);
  if (!cleaned) return { ok: false, status: 400, error: 'Nothing to speak' };

  const tokens = estimateTokens(cleaned);
  const reserved = await reserveBudget(env, tokens);
  if (!reserved.ok) return reserved;

  const attempts: Array<{ model: string; voiceMode: VoiceMode }> = [
    { model: cfg.model, voiceMode: 'voice' },
    { model: cfg.model, voiceMode: 'prebuilt' },
    { model: cfg.fallbackModel, voiceMode: 'voice' },
    { model: cfg.fallbackModel, voiceMode: 'prebuilt' },
  ];

  let lastError = 'TTS failed';
  for (const attempt of attempts) {
    try {
      const audio = await callGemini(cfg.apiKey, attempt.model, cfg.voice, cleaned, attempt.voiceMode);
      return { ok: true, audio, contentType: 'audio/wav' };
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'TTS failed';
    }
  }
  return { ok: false, status: 502, error: lastError };
}
