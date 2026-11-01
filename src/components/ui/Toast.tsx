import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { syncStore } from '@/lib/sync/syncStore';
import { cn } from '@/utils/cn';

type ToastTone = 'success' | 'error' | 'info' | 'warning' | 'reminder';

interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
  title?: string;
  image?: string;
  action?: { label: string; onClick: () => void };
}

export interface ReminderToastOptions {
  title: string;
  body: string;
  image?: string;
  action?: ToastItem['action'];
}

interface ToastApi {
  show: (message: string, tone?: Exclude<ToastTone, 'reminder'>, action?: ToastItem['action']) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  warning: (message: string) => void;
  reminder: (opts: ReminderToastOptions) => void;
}

const ToastContext = createContext<ToastApi | null>(null);
let nextId = 1;

const ICONS = {
  success: <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-hidden />,
  error: <XCircle className="h-4 w-4 text-rose-500" aria-hidden />,
  info: <Info className="h-4 w-4 text-sky-500" aria-hidden />,
  warning: <AlertTriangle className="h-4 w-4 text-amber-500" aria-hidden />,
};

function durationFor(tone: ToastTone): number {
  if (tone === 'reminder') return 12_000;
  if (tone === 'error' || tone === 'warning') return 7000;
  return 3500;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const push = useCallback(
    (item: Omit<ToastItem, 'id'>) => {
      const id = nextId++;
      setToasts((t) => [...t.slice(-3), { ...item, id }]);
      setTimeout(() => dismiss(id), durationFor(item.tone));
    },
    [dismiss],
  );

  const show = useCallback<ToastApi['show']>(
    (message, tone = 'info', action) => {
      push({ tone, message, action });
    },
    [push],
  );

  const reminder = useCallback<ToastApi['reminder']>(
    (opts) => {
      push({
        tone: 'reminder',
        title: opts.title,
        message: opts.body,
        image: opts.image,
        action: opts.action,
      });
    },
    [push],
  );

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (m) => show(m, 'success'),
      error: (m) => show(m, 'error'),
      info: (m) => show(m, 'info'),
      warning: (m) => show(m, 'warning'),
      reminder,
    }),
    [show, reminder],
  );

  useEffect(
    () =>
      syncStore.onEvent((e) => {
        show(e.message, e.type === 'conflict' ? 'warning' : 'error');
      }),
    [show],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:items-end lg:pr-6"
      >
        {toasts.map((t) =>
          t.tone === 'reminder' ? (
            <div
              key={t.id}
              role="status"
              className="pointer-events-auto flex w-full max-w-sm animate-slide-up overflow-hidden rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50 via-white to-indigo-50 shadow-xl shadow-amber-900/10 dark:border-amber-500/30 dark:from-amber-500/15 dark:via-slate-900 dark:to-indigo-500/10 dark:shadow-none"
            >
              {t.image && (
                <img src={t.image} alt="" className="h-24 w-24 shrink-0 object-cover" width={96} height={96} />
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-1 px-3.5 py-3">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">{t.title ?? 'Reminder'}</p>
                <p className="whitespace-pre-line text-xs leading-relaxed text-slate-600 dark:text-slate-300">{t.message}</p>
                <div className="mt-1 flex items-center gap-3">
                  {t.action && (
                    <button
                      type="button"
                      className="text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
                      onClick={() => {
                        t.action?.onClick();
                        dismiss(t.id);
                      }}
                    >
                      {t.action.label}
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label="Dismiss reminder"
                    onClick={() => dismiss(t.id)}
                    className="ml-auto text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div
              key={t.id}
              role={t.tone === 'error' ? 'alert' : 'status'}
              className={cn(
                'pointer-events-auto flex w-full max-w-sm animate-slide-up items-start gap-3 rounded-xl border bg-white px-4 py-3 text-sm shadow-lg',
                'border-slate-200 text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100',
              )}
            >
              <span className="mt-0.5">{ICONS[t.tone]}</span>
              <p className="min-w-0 flex-1">{t.message}</p>
              {t.action && (
                <button
                  type="button"
                  className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                  onClick={() => {
                    t.action?.onClick();
                    dismiss(t.id);
                  }}
                >
                  {t.action.label}
                </button>
              )}
              <button type="button" aria-label="Dismiss notification" onClick={() => dismiss(t.id)} className="text-slate-400 hover:text-slate-600">
                <X className="h-4 w-4" />
              </button>
            </div>
          ),
        )}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
