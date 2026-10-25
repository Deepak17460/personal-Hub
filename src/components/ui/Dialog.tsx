import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/utils/cn';
import { IconButton } from './Button';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Native <dialog> with showModal(): provides focus containment, Escape to close and an inert
 * background without extra dependencies. Content is only mounted while open.
 */
export function Dialog({ open, onClose, title, description, children, footer, size = 'md' }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={cn(
        'm-0 mt-auto w-full max-w-none rounded-t-3xl border-0 bg-transparent p-0 text-slate-900 sm:m-auto sm:rounded-2xl dark:text-slate-100',
        'max-h-[92dvh] backdrop:animate-fade-in open:animate-slide-up',
        size === 'sm' && 'sm:max-w-md',
        size === 'md' && 'sm:max-w-xl',
        size === 'lg' && 'sm:max-w-3xl',
      )}
    >
      {open && (
        <div className="flex max-h-[92dvh] flex-col rounded-t-3xl bg-white shadow-2xl sm:rounded-2xl dark:bg-slate-900 dark:ring-1 dark:ring-slate-800">
          <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
            <div className="min-w-0">
              <h2 id={titleId} className="text-base font-semibold">
                {title}
              </h2>
              {description && (
                <p id={descId} className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                  {description}
                </p>
              )}
            </div>
            <IconButton label="Close dialog" onClick={onClose} className="-mt-1 -mr-2 h-9 w-9">
              <X className="h-4 w-4" />
            </IconButton>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && (
            <footer className="safe-bottom flex flex-col-reverse gap-2 border-t border-slate-100 px-5 py-4 sm:flex-row sm:justify-end dark:border-slate-800">
              {footer}
            </footer>
          )}
        </div>
      )}
    </dialog>
  );
}
