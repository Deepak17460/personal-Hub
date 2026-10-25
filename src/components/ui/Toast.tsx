import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { syncStore } from '@/lib/sync/syncStore';
import { cn } from '@/utils/cn';

type ToastTone = 'success' | 'error' | 'info' | 'warning';
interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
  action?: { label: string; onClick: () => void };
}

interface ToastApi {
  show: (message: string, tone?: ToastTone, action?: ToastItem['action']) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  warning: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);
let nextId = 1;

const ICONS = {
  success: <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-hidden />,
  error: <XCircle className="h-4 w-4 text-rose-500" aria-hidden />,
  info: <Info className="h-4 w-4 text-sky-500" aria-hidden />,
  warning: <AlertTriangle className="h-4 w-4 text-amber-500" aria-hidden />,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const show = useCallback<ToastApi['show']>(
    (message, tone = 'info', action) => {
      const id = nextId++;
      setToasts((t) => [...t.slice(-3), { id, tone, message, action }]);
      setTimeout(() => dismiss(id), tone === 'error' || tone === 'warning' ? 7000 : 3500);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (m) => show(m, 'success'),
      error: (m) => show(m, 'error'),
      info: (m) => show(m, 'info'),
      warning: (m) => show(m, 'warning'),
    }),
    [show],
  );

  // Surface background sync failures and conflicts from the repository layer.
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
        {toasts.map((t) => (
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
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
