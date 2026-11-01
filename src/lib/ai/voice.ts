import { aiConfig } from './config';

export type SpeakSource = 'gemini' | 'device' | 'none';

export interface SpeakStatus {
  enabled: boolean;
  voice: string;
  model: string;
  dailyRequestsLeft: number | null;
  dailyTokensLeft: number | null;
  deviceFallback: boolean;
}

const VOICE_PREF_KEY = 'ph-assistant-voice-replies';
const LIVE_PREF_KEY = 'ph-assistant-live-voice';

export function voiceRepliesEnabled(): boolean {
  try {
    const v = localStorage.getItem(VOICE_PREF_KEY);
    // Default on so voice feels “active” until the owner turns it off.
    if (v === null) return true;
    return v === '1';
  } catch {
    return true;
  }
}

export function setVoiceRepliesEnabled(on: boolean): void {
  try {
    localStorage.setItem(VOICE_PREF_KEY, on ? '1' : '0');
  } catch {
    /* ignore */
  }
}

export function liveVoiceEnabled(): boolean {
  try {
    return localStorage.getItem(LIVE_PREF_KEY) === '1';
  } catch {
    return false;
  }
}

export function setLiveVoiceEnabled(on: boolean): void {
  try {
    localStorage.setItem(LIVE_PREF_KEY, on ? '1' : '0');
  } catch {
    /* ignore */
  }
}

function proxyRoot(): string {
  return aiConfig.baseUrl.replace(/\/$/, '');
}

let currentAudio: HTMLAudioElement | null = null;

export function stopSpeaking(): void {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = '';
    currentAudio = null;
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

function speakWithDevice(text: string): Promise<SpeakSource> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      resolve('none');
      return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.slice(0, 1200));
    u.rate = 1.02;
    u.onend = () => resolve('device');
    u.onerror = () => resolve('none');
    window.speechSynthesis.speak(u);
  });
}

export async function fetchSpeakStatus(signal?: AbortSignal): Promise<SpeakStatus | null> {
  const root = proxyRoot();
  if (!root.startsWith('http')) return null;
  try {
    const res = await fetch(`${root}/speak/status`, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as SpeakStatus;
  } catch {
    return null;
  }
}

/** Prefer Gemini TTS via Worker; fall back to the device voice. */
export async function speakText(text: string, opts: { preferDevice?: boolean } = {}): Promise<SpeakSource> {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return 'none';
  stopSpeaking();

  if (opts.preferDevice) return speakWithDevice(cleaned);

  const root = proxyRoot();
  if (root.startsWith('http')) {
    try {
      const res = await fetch(`${root}/speak/audio`, {
        method: 'POST',
        mode: 'cors',
        credentials: 'omit',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: cleaned }),
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        currentAudio = audio;
        await new Promise<void>((resolve, reject) => {
          audio.onended = () => {
            URL.revokeObjectURL(url);
            if (currentAudio === audio) currentAudio = null;
            resolve();
          };
          audio.onerror = () => {
            URL.revokeObjectURL(url);
            if (currentAudio === audio) currentAudio = null;
            reject(new Error('audio play failed'));
          };
          void audio.play().catch(reject);
        });
        return 'gemini';
      }
    } catch {
      /* fall through to device */
    }
  }

  return speakWithDevice(cleaned);
}

interface SpeechRecResult {
  readonly isFinal: boolean;
  readonly 0: { transcript: string };
}

interface SpeechRecEvent {
  readonly resultIndex: number;
  readonly results: ArrayLike<SpeechRecResult>;
}

interface SpeechRec {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((ev: SpeechRecEvent) => void) | null;
  onerror: ((ev?: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecCtor = new () => SpeechRec;

function getRecognitionCtor(): SpeechRecCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: SpeechRecCtor; webkitSpeechRecognition?: SpeechRecCtor };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function speechInputSupported(): boolean {
  return Boolean(getRecognitionCtor());
}

/** One-shot capture (legacy). Prefer startLiveListening for hands-free mode. */
export function listenOnce(opts: {
  onInterim?: (text: string) => void;
  lang?: string;
}): { stop: () => void; done: Promise<string | null> } {
  const Ctor = getRecognitionCtor();
  if (!Ctor) {
    return { stop: () => undefined, done: Promise.resolve(null) };
  }

  const rec = new Ctor();
  rec.continuous = false;
  rec.interimResults = true;
  rec.lang = opts.lang || (typeof navigator !== 'undefined' ? navigator.language : 'en-US') || 'en-US';

  let settled = false;
  let finalText = '';

  const done = new Promise<string | null>((resolve) => {
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
      resolve(value);
    };

    rec.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const row = event.results[i];
        const piece = row?.[0]?.transcript ?? '';
        if (row?.isFinal) finalText += piece;
        else interim += piece;
      }
      opts.onInterim?.((finalText + interim).trim());
    };
    rec.onerror = () => finish(finalText.trim() || null);
    rec.onend = () => finish(finalText.trim() || null);

    try {
      rec.start();
    } catch {
      finish(null);
    }
  });

  return {
    stop: () => {
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
    },
    done,
  };
}

/** Wait this long after the last heard speech before sending the full sentence. */
const LIVE_SILENCE_MS = 1700;

/**
 * Hands-free listening: keeps the mic open until stop().
 * Accumulates speech and only emits a full utterance after a short silence
 * (mobile Chrome often marks mid-sentence chunks as final — do not send those early).
 */
export function startLiveListening(opts: {
  onInterim?: (text: string) => void;
  onUtterance: (text: string) => void;
  /** When true, recognition is paused (e.g. while the assistant is thinking or talking). */
  shouldPause?: () => boolean;
  lang?: string;
  /** Silence before commit; default ~1.7s so full sentences can finish. */
  silenceMs?: number;
}): { stop: () => void } {
  const Ctor = getRecognitionCtor();
  if (!Ctor) return { stop: () => undefined };

  const silenceMs = opts.silenceMs ?? LIVE_SILENCE_MS;
  let stopped = false;
  let rec: SpeechRec | null = null;
  let restartTimer: number | null = null;
  let pausePoll: number | null = null;
  let silenceTimer: number | null = null;
  let finalBuffer = '';
  let interimBuffer = '';

  const clearSilence = () => {
    if (silenceTimer != null) {
      window.clearTimeout(silenceTimer);
      silenceTimer = null;
    }
  };

  const clearTimers = () => {
    clearSilence();
    if (restartTimer != null) {
      window.clearTimeout(restartTimer);
      restartTimer = null;
    }
    if (pausePoll != null) {
      window.clearInterval(pausePoll);
      pausePoll = null;
    }
  };

  const preview = () => {
    opts.onInterim?.(`${finalBuffer} ${interimBuffer}`.replace(/\s+/g, ' ').trim());
  };

  const flushUtterance = () => {
    clearSilence();
    const text = `${finalBuffer} ${interimBuffer}`.replace(/\s+/g, ' ').trim();
    if (!text) {
      interimBuffer = '';
      opts.onInterim?.('');
      return;
    }
    // Don't drop a half-finished sentence while the assistant is busy — keep the buffer.
    if (opts.shouldPause?.()) return;
    finalBuffer = '';
    interimBuffer = '';
    opts.onInterim?.('');
    opts.onUtterance(text);
  };

  const bumpSilence = () => {
    clearSilence();
    if (stopped) return;
    silenceTimer = window.setTimeout(() => {
      silenceTimer = null;
      flushUtterance();
    }, silenceMs);
  };

  const stopRec = () => {
    if (!rec) return;
    const r = rec;
    rec = null;
    r.onresult = null;
    r.onerror = null;
    r.onend = null;
    try {
      r.stop();
    } catch {
      try {
        r.abort();
      } catch {
        /* ignore */
      }
    }
  };

  const scheduleStart = (delayMs: number) => {
    if (stopped) return;
    if (restartTimer != null) window.clearTimeout(restartTimer);
    restartTimer = window.setTimeout(() => {
      restartTimer = null;
      startRec();
    }, delayMs);
  };

  const startRec = () => {
    if (stopped) return;
    if (opts.shouldPause?.()) {
      // Hold any unfinished phrase until the assistant is done, then flush once.
      if (finalBuffer || interimBuffer) bumpSilence();
      if (pausePoll == null) {
        pausePoll = window.setInterval(() => {
          if (stopped) {
            clearTimers();
            return;
          }
          if (!opts.shouldPause?.()) {
            if (pausePoll != null) {
              window.clearInterval(pausePoll);
              pausePoll = null;
            }
            // Finish anything captured just before the assistant started talking.
            flushUtterance();
            scheduleStart(220);
          }
        }, 250);
      }
      return;
    }

    stopRec();
    const next = new Ctor();
    rec = next;
    // continuous=false + restart tends to capture fuller phrases on mobile Chrome.
    next.continuous = false;
    next.interimResults = true;
    next.lang = opts.lang || (typeof navigator !== 'undefined' ? navigator.language : 'en-US') || 'en-US';

    next.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const row = event.results[i];
        const piece = (row?.[0]?.transcript ?? '').trim();
        if (!piece) continue;
        if (row?.isFinal) {
          finalBuffer = `${finalBuffer} ${piece}`.replace(/\s+/g, ' ').trim();
        } else {
          interim = `${interim} ${piece}`.trim();
        }
      }
      interimBuffer = interim;
      preview();
      // Only commit after the speaker pauses — never on each tiny final chunk.
      bumpSilence();
    };

    next.onerror = (ev) => {
      if (stopped) return;
      const code = ev?.error ?? '';
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        stopped = true;
        clearTimers();
        stopRec();
        return;
      }
      // no-speech: keep waiting; aborted: restart
      scheduleStart(code === 'no-speech' ? 280 : 400);
    };

    next.onend = () => {
      if (stopped) return;
      // Session ended — keep buffered text and let the silence timer finish the sentence,
      // then restart listening for the next turn.
      if (finalBuffer || interimBuffer) bumpSilence();
      scheduleStart(opts.shouldPause?.() ? 400 : 250);
    };

    try {
      next.start();
    } catch {
      scheduleStart(500);
    }
  };

  startRec();

  return {
    stop: () => {
      stopped = true;
      // Discard incomplete dictation on manual stop (user cancelled).
      clearTimers();
      finalBuffer = '';
      interimBuffer = '';
      opts.onInterim?.('');
      stopRec();
    },
  };
}
