import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Bot, CheckCircle2, ChevronRight, Loader2, Send, Sparkles, Square, Trash2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Markdown } from '@/components/ui/Markdown';
import { cn } from '@/utils/cn';
import { useAssistantChat } from './useAssistantChat';
import type { AssistantMode, UiMessage } from './types';

function ModeToggle({ mode, onChange, disabled }: { mode: AssistantMode; onChange: (m: AssistantMode) => void; disabled?: boolean }) {
  return (
    <div className="inline-flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800" role="group" aria-label="Assistant mode">
      {(
        [
          { id: 'agent', label: 'Do it for me' },
          { id: 'chat', label: 'Chat only' },
        ] as const
      ).map((opt) => (
        <button
          key={opt.id}
          type="button"
          disabled={disabled}
          onClick={() => onChange(opt.id)}
          className={cn(
            'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors sm:text-sm',
            mode === opt.id
              ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
              : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function Bubble({ message }: { message: UiMessage }) {
  const mine = message.role === 'user';
  return (
    <div className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-3xl rounded-2xl px-4 py-3 text-sm',
          mine && 'bg-indigo-600 text-white',
          !mine && !message.error && 'bg-white ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800',
          message.error && 'bg-rose-50 text-rose-800 ring-1 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-200 dark:ring-rose-500/30',
        )}
      >
        {mine || message.error ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : message.pending ? (
          <p className="flex items-center gap-2 text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            {message.content}
          </p>
        ) : (
          <Markdown source={message.content} />
        )}
        {!!message.actions?.length && (
          <ul className="mt-3 space-y-1.5">
            {message.actions.map((a, i) => {
              const canOpen = Boolean(a.ok && a.link);
              const className = cn(
                'flex w-full items-start gap-2 rounded-xl px-3 py-2.5 text-xs',
                a.ok ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-100' : 'bg-rose-50 text-rose-900 dark:bg-rose-500/10 dark:text-rose-100',
              );
              const body = (
                <>
                  {a.ok ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                  <span className="min-w-0 flex-1 text-left font-medium">{a.summary}</span>
                  {canOpen && <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 opacity-70" aria-hidden />}
                </>
              );
              return (
                <li key={`${a.name}-${i}`}>
                  {canOpen && a.link ? (
                    <Link to={a.link} className={className} aria-label={`Open: ${a.summary}`}>
                      {body}
                    </Link>
                  ) : (
                    <div className={className}>{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function AssistantPage() {
  const { mode, setMode, messages, busy, configured, suggestions, send, clear, stop } = useAssistantChat();
  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    void send(text);
  };

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-3xl flex-col gap-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-medium text-indigo-600 dark:text-indigo-400">
            <Bot className="h-4 w-4" />
            Assistant
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Get work done with AI</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Use <strong className="font-medium text-slate-700 dark:text-slate-200">Do it for me</strong> to create and update hub items, or{' '}
            <strong className="font-medium text-slate-700 dark:text-slate-200">Chat only</strong> for advice without writes.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ModeToggle mode={mode} onChange={setMode} disabled={busy} />
          <Button type="button" variant="ghost" size="sm" onClick={clear} disabled={busy || !messages.length} icon={<Trash2 className="h-3.5 w-3.5" />}>
            Clear
          </Button>
        </div>
      </header>

      {!configured && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
          Configure <code className="font-mono text-xs">VITE_AI_BASE_URL</code> and <code className="font-mono text-xs">VITE_AI_API_KEY</code> in{' '}
          <code className="font-mono text-xs">.env.local</code>, then restart the dev server.
        </div>
      )}

      <section className="card flex min-h-[28rem] flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col justify-center gap-4 py-8">
              <div className="mx-auto max-w-md text-center">
                <Sparkles className="mx-auto h-8 w-8 text-indigo-500" />
                <p className="mt-3 text-sm font-medium">
                  {mode === 'agent' ? 'Tell me what to create or find' : 'Ask for help thinking something through'}
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={!configured || busy}
                    onClick={() => void send(s)}
                    className="rounded-full border border-slate-200 px-3 py-1.5 text-xs text-slate-700 hover:border-indigo-300 hover:bg-indigo-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-indigo-500/10"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m) => <Bubble key={m.id} message={m} />)
          )}
          <div ref={endRef} />
        </div>

        <form onSubmit={submit} className="border-t border-slate-100 p-3 sm:p-4 dark:border-slate-800">
          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              rows={3}
              placeholder={mode === 'agent' ? 'e.g. Create three tasks for my project launch…' : 'Ask anything…'}
              aria-label="Message the assistant"
              className="input-base min-h-24 flex-1 resize-none"
            />
            {busy ? (
              <Button type="button" variant="secondary" onClick={stop} icon={<Square className="h-4 w-4" />}>
                Stop
              </Button>
            ) : (
              <Button type="submit" disabled={!draft.trim() || !configured} icon={<Send className="h-4 w-4" />}>
                Send
              </Button>
            )}
          </div>
        </form>
      </section>
    </div>
  );
}
