/**
 * Personal Hub AI proxy (Cloudflare Worker).
 * - POST /v1/chat/completions → Bedrock gateway (server-to-server)
 * - GET  /v1/speak/status     → Gemini TTS availability + budget
 * - POST /v1/speak/audio      → Gemini TTS WAV (rate-limited)
 */

import { getTtsStatus, synthesizeSpeech, type TtsEnv } from './tts';

export interface Env extends TtsEnv {
  CHAT_BACKEND_URL: string;
  CHAT_BACKEND_API_KEY: string;
  CHAT_BACKEND_MODEL?: string;
  ALLOWED_ORIGINS: string;
}

const USER_AGENT = 'personal-hub-ai-proxy/1.1';

function isTrustedHubOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    if (u.protocol !== 'https:' && u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') return false;
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return true;
    return (
      u.hostname === 'personal-hub-ea5ea.web.app' ||
      u.hostname === 'personal-hub-ea5ea.firebaseapp.com' ||
      u.hostname.endsWith('.personal-hub-ea5ea.web.app')
    );
  } catch {
    return false;
  }
}

function allowedOrigin(req: Request, env: Env): string | null {
  const allow = env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
  const origin = req.headers.get('Origin');
  if (origin && (allow.includes(origin) || isTrustedHubOrigin(origin))) return origin;

  const referer = req.headers.get('Referer');
  if (referer) {
    try {
      const refOrigin = new URL(referer).origin;
      if (allow.includes(refOrigin) || isTrustedHubOrigin(refOrigin)) return refOrigin;
    } catch {
      /* ignore */
    }
  }
  return null;
}

function corsHeaders(origin: string | null): HeadersInit {
  if (!origin) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(status: number, body: unknown, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders(origin),
    },
  });
}

function backendBase(env: Env): string | null {
  const url = env.CHAT_BACKEND_URL?.trim().replace(/\/+$/, '');
  if (!url || !env.CHAT_BACKEND_API_KEY) return null;
  if (!/^https:\/\/[^/?#\s]+(\/[^?#\s]*)?$/.test(url)) return null;
  return url;
}

async function handleChat(req: Request, env: Env, origin: string): Promise<Response> {
  const base = backendBase(env);
  if (!base) return json(500, { error: 'Gateway is not configured on the proxy' }, origin);

  let payload: Record<string, unknown>;
  try {
    payload = (await req.json()) as Record<string, unknown>;
  } catch {
    return json(400, { error: 'Invalid JSON body' }, origin);
  }

  if (!payload.model && env.CHAT_BACKEND_MODEL) payload.model = env.CHAT_BACKEND_MODEL;
  payload.stream = false;

  const upstream = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.CHAT_BACKEND_API_KEY}`,
      'User-Agent': USER_AGENT,
    },
    body: JSON.stringify(payload),
    redirect: 'manual',
    signal: AbortSignal.timeout(60_000),
  });

  if (upstream.status >= 300 && upstream.status < 400) {
    return json(502, { error: 'Gateway redirected; refusing to follow with credentials' }, origin);
  }

  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') || 'application/json; charset=utf-8',
      ...corsHeaders(origin),
    },
  });
}

async function handleSpeakAudio(req: Request, env: Env, origin: string): Promise<Response> {
  let body: { text?: string };
  try {
    body = (await req.json()) as { text?: string };
  } catch {
    return json(400, { error: 'Invalid JSON body' }, origin);
  }
  const text = typeof body.text === 'string' ? body.text : '';
  const result = await synthesizeSpeech(env, text);
  if (!result.ok) return json(result.status, { error: result.error, deviceFallback: true }, origin);

  return new Response(result.audio, {
    status: 200,
    headers: {
      'Content-Type': result.contentType,
      'Cache-Control': 'no-store',
      ...corsHeaders(origin),
    },
  });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const origin = allowedOrigin(req, env);

    if (req.method === 'OPTIONS') {
      if (!origin) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (req.method === 'GET' && (path === '/' || path === '/health')) {
      return json(200, { ok: true, service: 'personal-hub-ai-proxy' }, origin);
    }

    if (!origin) return json(403, { error: 'Origin not allowed' }, origin);

    if (req.method === 'GET' && (path === '/v1/speak/status' || path.endsWith('/speak/status'))) {
      return json(200, await getTtsStatus(env), origin);
    }

    if (req.method === 'POST' && (path === '/v1/speak/audio' || path.endsWith('/speak/audio'))) {
      return handleSpeakAudio(req, env, origin);
    }

    if (req.method === 'POST' && path.endsWith('/chat/completions')) {
      return handleChat(req, env, origin);
    }

    return json(404, { error: 'Not found' }, origin);
  },
};
