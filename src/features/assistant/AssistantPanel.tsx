import { useEffect, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { useNavigate } from 'react-router';
import { Bot, CheckCircle2, ChevronRight, Loader2, Mic, MicOff, Send, Sparkles, Square, Trash2, Volume2, VolumeX, X, XCircle } from 'lucide-react';
import { Button, IconButton } from '@/components/ui/Button';
import { Markdown } from '@/components/ui/Markdown';
import { isAiConfigured } from '@/lib/ai/config';
import {
  setLiveVoiceEnabled,
  setVoiceRepliesEnabled,
  speakText,
  speechInputSupported,
  startLiveListening,
  stopSpeaking,
  voiceRepliesEnabled,
} from '@/lib/ai/voice';
import { cn } from '@/utils/cn';
import { useAssistantChat } from './useAssistantChat';
import type { AssistantMode, UiMessage } from './types';

function ModeToggle({ mode, onChange, disabled }: { mode: AssistantMode; onChange: (m: AssistantMode) => void; disabled?: boolean }) {
  return (
    <div
      className="inline-flex rounded-lg p-0.5"
      style={{ background: 'var(--hub-surface-2)' }}
      role="group"
      aria-label="Assistant mode"
    >
      {(
        [
          { id: 'agent', label: 'Do it' },
          { id: 'chat', label: 'Chat only' },
        ] as const
      ).map((opt) => (
        <button
          key={opt.id}
          type="button"
          disabled={disabled}
          onClick={() => onChange(opt.id)}
          className={cn('rounded-md px-2.5 py-1 text-xs font-medium transition-colors')}
          style={
            mode === opt.id
              ? { background: 'var(--hub-surface)', color: 'var(--hub-text)', boxShadow: '0 1px 2px rgb(0 0 0 / 0.08)' }
              : { color: 'var(--hub-muted)' }
          }
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function ActionChips({ message, onOpenLink }: { message: UiMessage; onOpenLink: (path: string) => void }) {
  if (!message.actions?.length) return null;
  return (
    <ul className="mt-2 space-y-1.5">
      {message.actions.map((a, i) => {
        const canOpen = Boolean(a.ok && a.link);
        const body = (
          <>
            {a.ok ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
            <span className="min-w-0 flex-1 text-left font-medium">{a.summary}</span>
            {canOpen && <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 opacity-70" aria-hidden />}
          </>
        );
        const className = cn(
          'flex w-full items-start gap-2 rounded-lg border px-2.5 py-2.5 text-xs',
          a.ok
            ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100'
            : 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-100',
          canOpen && 'active:brightness-95',
        );
        return (
          <li key={`${a.name}-${i}`}>
            {canOpen && a.link ? (
              <button type="button" className={className} onClick={() => onOpenLink(a.link!)} aria-label={`Open: ${a.summary}`}>
                {body}
              </button>
            ) : (
              <div className={className}>{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Bubble({
  message,
  onOpenLink,
  onSpeak,
}: {
  message: UiMessage;
  onOpenLink: (path: string) => void;
  onSpeak?: (text: string) => void;
}) {
  const mine = message.role === 'user';
  const canSpeak = !mine && !message.error && !message.pending && Boolean(message.content.trim()) && onSpeak;
  return (
    <div className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[min(92%,36rem)] min-w-0 overflow-x-auto rounded-2xl px-3.5 py-2.5 text-sm break-words',
          message.pending && 'opacity-80',
        )}
        style={
          mine
            ? { background: 'var(--hub-accent)', color: '#fff' }
            : message.error
              ? { background: 'color-mix(in srgb, #e11d48 12%, var(--hub-surface))', color: '#fb7185' }
              : { background: 'var(--hub-surface-2)', color: 'var(--hub-text)' }
        }
      >
        {mine || message.error ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : message.pending ? (
          <p className="flex items-center gap-2" style={{ color: 'var(--hub-muted)' }}>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {message.content}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Markdown source={message.content} />
          </div>
        )}
        <ActionChips message={message} onOpenLink={onOpenLink} />
        {canSpeak && (
          <button
            type="button"
            className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium opacity-80 hover:opacity-100"
            style={{ color: 'var(--hub-muted)' }}
            onClick={() => onSpeak(message.content)}
          >
            <Volume2 className="h-3.5 w-3.5" />
            Play voice
          </button>
        )}
      </div>
    </div>
  );
}

function isCoarsePointer(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(hover: none), (max-width: 640px)').matches;
}

export function AssistantPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const { mode, setMode, messages, busy, configured, suggestions, send, clear, stop } = useAssistantChat();
  const [draft, setDraft] = useState('');
  const [entered, setEntered] = useState(false);
  const [mounted, setMounted] = useState(open);
  const [mobileSheet, setMobileSheet] = useState(false);
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);
  const [voiceOn, setVoiceOn] = useState(() => voiceRepliesEnabled());
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const liveStopRef = useRef<(() => void) | null>(null);
  const lastSpokenId = useRef<string | null>(null);
  const busyRef = useRef(busy);
  const speakingRef = useRef(speaking);
  const sendRef = useRef(send);
  const canListen = speechInputSupported();

  busyRef.current = busy;
  speakingRef.current = speaking;
  sendRef.current = send;

  const openAction = (path: string) => {
    navigate(path);
    onClose();
  };

  const toggleVoice = () => {
    const next = !voiceOn;
    setVoiceOn(next);
    setVoiceRepliesEnabled(next);
    if (!next) stopSpeaking();
  };

  const playMessage = (text: string) => {
    setSpeaking(true);
    void speakText(text).finally(() => setSpeaking(false));
  };

  const stopLive = () => {
    liveStopRef.current?.();
    liveStopRef.current = null;
    setListening(false);
    setLiveVoiceEnabled(false);
    setDraft('');
  };

  const startLive = () => {
    if (!canListen || !configured) return;
    stopLive();
    setVoiceOn(true);
    setVoiceRepliesEnabled(true);
    setLiveVoiceEnabled(true);
    setListening(true);

    const session = startLiveListening({
      shouldPause: () => busyRef.current || speakingRef.current,
      onInterim: (t) => setDraft(t),
      onUtterance: (text) => {
        const cleaned = text.trim();
        if (!cleaned || busyRef.current) return;
        setDraft('');
        void sendRef.current(cleaned);
      },
    });
    liveStopRef.current = session.stop;
  };

  const toggleListen = () => {
    if (listening) stopLive();
    else startLive();
  };

  // Keep mounted through the close animation.
  useEffect(() => {
    if (open) {
      setMobileSheet(isCoarsePointer());
      setMounted(true);
      const id = window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => setEntered(true));
      });
      return () => window.cancelAnimationFrame(id);
    }
    setEntered(false);
    const t = window.setTimeout(() => setMounted(false), 220);
    return () => window.clearTimeout(t);
  }, [open]);

  // Lock page scroll; on phones also freeze the visual viewport height so the panel
  // doesn't jump when the browser chrome or keyboard changes.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    const prevPosition = document.body.style.position;
    const prevTop = document.body.style.top;
    const prevWidth = document.body.style.width;
    const scrollY = window.scrollY;
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';

    const syncViewport = () => {
      const h = window.visualViewport?.height ?? window.innerHeight;
      setViewportHeight(h);
    };
    syncViewport();
    window.visualViewport?.addEventListener('resize', syncViewport);
    window.visualViewport?.addEventListener('scroll', syncViewport);

    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.position = prevPosition;
      document.body.style.top = prevTop;
      document.body.style.width = prevWidth;
      window.scrollTo(0, scrollY);
      window.visualViewport?.removeEventListener('resize', syncViewport);
      window.visualViewport?.removeEventListener('scroll', syncViewport);
    };
  }, [open]);

  // Auto-focus only on desktop. On phones, focusing opens the keyboard and shoves the panel down.
  useEffect(() => {
    if (!open || !entered || isCoarsePointer() || listening) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 40);
    return () => window.clearTimeout(t);
  }, [open, entered, listening]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, open]);

  // Auto-speak the latest assistant reply when voice replies are on; pause live mic while speaking.
  useEffect(() => {
    if (!open || !voiceOn || busy) return;
    const last = [...messages].reverse().find((m) => m.role === 'assistant' && !m.pending && !m.error && m.content.trim());
    if (!last || last.id === lastSpokenId.current) return;
    lastSpokenId.current = last.id;
    setSpeaking(true);
    void speakText(last.content).finally(() => setSpeaking(false));
  }, [messages, voiceOn, busy, open]);

  useEffect(() => {
    if (open) return;
    stopSpeaking();
    stopLive();
    setSpeaking(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    void send(text);
  };

  if (!mounted) return null;

  const overlayOpacity = entered ? 1 : 0;
  const panelMotion = mobileSheet
    ? {
        opacity: entered ? 1 : 0,
        transform: 'none',
        transition: 'opacity 180ms ease-out',
      }
    : {
        opacity: 1,
        transform: entered ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1)',
      };

  return (
    <div
      className="fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      aria-label="AI assistant"
      style={viewportHeight ? { height: viewportHeight } : undefined}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/45 transition-opacity duration-200"
        style={{ opacity: overlayOpacity }}
        aria-label="Close assistant"
        onClick={onClose}
      />
      <aside
        className={cn(
          'hub-surface fixed z-50 flex min-h-0 flex-col overflow-hidden shadow-2xl',
          mobileSheet ? 'inset-0 border-0' : 'top-0 right-0 bottom-0 w-full max-w-md border-l',
        )}
        style={{
          ...panelMotion,
          height: viewportHeight ?? undefined,
          maxHeight: viewportHeight ?? undefined,
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <header className="hub-border flex shrink-0 items-start gap-3 border-b px-4 py-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white"
            style={{ background: 'var(--hub-accent)' }}
          >
            <Bot className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1 overflow-x-auto">
            <h2 className="text-sm font-semibold">Hub Assistant</h2>
            <p className="text-xs" style={{ color: 'var(--hub-muted)' }}>
              {listening
                ? 'Live voice on — keep talking; tap mic to stop'
                : mode === 'agent'
                  ? 'Can read and update notes, links, tasks, events…'
                  : 'Advice and drafts only — no writes'}
            </p>
            <div className="mt-2 overflow-x-auto">
              <ModeToggle mode={mode} onChange={setMode} disabled={busy} />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <IconButton
              label={voiceOn ? 'Voice replies on' : 'Voice replies off'}
              onClick={toggleVoice}
              aria-pressed={voiceOn}
            >
              {voiceOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </IconButton>
            <IconButton label="Clear conversation" onClick={clear} disabled={busy || messages.length === 0}>
              <Trash2 className="h-4 w-4" />
            </IconButton>
            <IconButton label="Close assistant" onClick={onClose}>
              <X className="h-4 w-4" />
            </IconButton>
          </div>
        </header>

        {!configured && (
          <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
            Deploy the AI proxy (<code className="font-mono">workers/hub-ai-proxy</code>) and set{' '}
            <code className="font-mono">VITE_AI_PROXY_URL</code>, or use local Vite with the gateway key in{' '}
            <code className="font-mono">.env.local</code>.
          </div>
        )}

        {listening && (
          <div
            className="flex shrink-0 items-center gap-2 border-b px-4 py-2 text-xs"
            style={{ borderColor: 'var(--hub-border)', background: 'var(--hub-surface-2)', color: 'var(--hub-text)' }}
          >
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-500" />
            </span>
            {busy || speaking ? 'Paused while assistant responds…' : 'Listening — finish your sentence, then pause'}
          </div>
        )}

        <div
          ref={listRef}
          className="min-h-0 flex-1 space-y-3 overflow-auto overscroll-contain px-4 py-4"
        >
          {messages.length === 0 ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-dashed p-4" style={{ borderColor: 'var(--hub-border)' }}>
                <p className="flex items-center gap-2 text-sm font-medium">
                  <Sparkles className="h-4 w-4" style={{ color: 'var(--hub-accent)' }} />
                  {mode === 'agent' ? 'Ask me to get work done' : 'Ask me anything'}
                </p>
                <p className="mt-1 text-xs" style={{ color: 'var(--hub-muted)' }}>
                  {mode === 'agent'
                    ? 'Talk live with the mic, set calendar alarms, manage tasks — or type below.'
                    : 'Brainstorm, rewrite text, or plan — I won’t change your data.'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={!isAiConfigured || busy}
                    onClick={() => void send(s)}
                    className="rounded-full border px-3 py-1.5 text-left text-xs transition-colors"
                    style={{
                      borderColor: 'var(--hub-border)',
                      color: 'var(--hub-text)',
                      background: 'var(--hub-surface-2)',
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m) => <Bubble key={m.id} message={m} onOpenLink={openAction} onSpeak={playMessage} />)
          )}
          <div ref={endRef} />
        </div>

        <form onSubmit={submit} className="hub-border shrink-0 border-t px-3 py-3">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              rows={2}
              placeholder={
                listening
                  ? 'Listening… speak now'
                  : mode === 'agent'
                    ? 'Tell me what to do…'
                    : 'Ask anything…'
              }
              aria-label="Message the assistant"
              className="input-base min-h-18 flex-1 resize-none overflow-auto py-2.5"
            />
            {canListen && (
              <Button
                type="button"
                variant={listening ? 'secondary' : 'ghost'}
                size="icon"
                aria-label={listening ? 'Stop live voice' : 'Start live voice'}
                aria-pressed={listening}
                disabled={!configured}
                onClick={toggleListen}
                className={listening ? '!bg-rose-600 !text-white hover:!brightness-110' : undefined}
              >
                {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </Button>
            )}
            {busy ? (
              <Button type="button" variant="secondary" size="icon" aria-label="Stop" onClick={stop}>
                <Square className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                type="submit"
                size="icon"
                aria-label="Send"
                disabled={!draft.trim() || !configured}
                className="!bg-[var(--hub-accent)] hover:!brightness-110"
              >
                <Send className="h-4 w-4" />
              </Button>
            )}
          </div>
          <p className="mt-2 overflow-x-auto text-[11px] whitespace-nowrap" style={{ color: 'var(--hub-muted)' }}>
            {listening
              ? 'Speak a full sentence, then pause — it sends after you stop talking'
              : canListen
                ? 'Mic = live voice · speaker = read replies · scroll chat any direction'
                : 'Enter to send · Shift+Enter for a new line'}
          </p>
        </form>
      </aside>
    </div>
  );
}

const FAB_POS_KEY = 'ph-assistant-fab-pos';
const FAB_SIZE = 56;
const FAB_MARGIN = 12;
const DRAG_THRESHOLD = 8;

function defaultFabPos(): { x: number; y: number } {
  if (typeof window === 'undefined') return { x: 16, y: 16 };
  const bottomGap = window.matchMedia('(min-width: 1024px)').matches ? 24 : 80;
  return {
    x: Math.max(FAB_MARGIN, window.innerWidth - FAB_MARGIN - FAB_SIZE),
    y: Math.max(FAB_MARGIN, window.innerHeight - bottomGap - FAB_SIZE),
  };
}

function clampFabPos(x: number, y: number): { x: number; y: number } {
  const maxX = Math.max(FAB_MARGIN, window.innerWidth - FAB_MARGIN - FAB_SIZE);
  const maxY = Math.max(FAB_MARGIN, window.innerHeight - FAB_MARGIN - FAB_SIZE);
  return {
    x: Math.min(maxX, Math.max(FAB_MARGIN, x)),
    y: Math.min(maxY, Math.max(FAB_MARGIN, y)),
  };
}

function loadFabPos(): { x: number; y: number } {
  try {
    const raw = localStorage.getItem(FAB_POS_KEY);
    if (!raw) return defaultFabPos();
    const parsed = JSON.parse(raw) as { x?: unknown; y?: unknown };
    if (typeof parsed.x !== 'number' || typeof parsed.y !== 'number') return defaultFabPos();
    return clampFabPos(parsed.x, parsed.y);
  } catch {
    return defaultFabPos();
  }
}

function saveFabPos(pos: { x: number; y: number }): void {
  try {
    localStorage.setItem(FAB_POS_KEY, JSON.stringify(pos));
  } catch {
    /* ignore */
  }
}

/** Draggable bot button — drag to reposition; tap/click to open. Position is remembered on this device. */
export function AssistantFab({ onClick }: { onClick: () => void }) {
  const [pos, setPos] = useState(() => (typeof window === 'undefined' ? { x: 16, y: 16 } : loadFabPos()));
  const posRef = useRef(pos);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    dragged: boolean;
  } | null>(null);
  const [dragging, setDragging] = useState(false);

  posRef.current = pos;

  useEffect(() => {
    const onResize = () => setPos((p) => clampFabPos(p.x, p.y));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const onPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: posRef.current.x,
      originY: posRef.current.y,
      dragged: false,
    };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.dragged && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    if (!drag.dragged) {
      drag.dragged = true;
      setDragging(true);
    }
    setPos(clampFabPos(drag.originX + dx, drag.originY + dy));
  };

  const endDrag = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (drag.dragged) {
      const next = clampFabPos(posRef.current.x, posRef.current.y);
      setPos(next);
      saveFabPos(next);
      setDragging(false);
      return;
    }
    setDragging(false);
    onClick();
  };

  return (
    <button
      type="button"
      aria-label="Open AI assistant. Drag to move."
      title="Drag to move · tap to open"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className={cn(
        'fixed z-30 flex h-14 w-14 touch-none items-center justify-center rounded-2xl text-white shadow-lg select-none',
        dragging ? 'cursor-grabbing scale-105' : 'cursor-grab hover:brightness-110',
      )}
      style={{
        background: 'var(--hub-accent)',
        left: pos.x,
        top: pos.y,
        right: 'auto',
        bottom: 'auto',
      }}
    >
      <Bot className="h-6 w-6 pointer-events-none" />
    </button>
  );
}
