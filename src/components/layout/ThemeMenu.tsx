import { useEffect, useId, useRef, useState } from 'react';
import { Check, Monitor, Moon, Sun } from 'lucide-react';
import { usePreferences } from '@/hooks/useData';
import { useTheme } from '@/hooks/useTheme';
import { isOnline } from '@/lib/sync/syncStore';
import type { ThemePreference } from '@/types/models';
import { cn } from '@/utils/cn';
import { IconButton } from '../ui/Button';

const OPTIONS: {
  value: ThemePreference;
  label: string;
  hint: string;
  icon: typeof Sun;
}[] = [
  { value: 'light', label: 'Light', hint: 'Bright background', icon: Sun },
  { value: 'dark', label: 'Dark', hint: 'Dim background', icon: Moon },
  { value: 'system', label: 'Use system setting', hint: 'Match Windows / device', icon: Monitor },
];

function ThemePreview({ value }: { value: ThemePreference }) {
  if (value === 'light') {
    return (
      <span className="relative h-9 w-12 overflow-hidden rounded-md border border-[#d1d1d1] bg-[#f3f2f1] shadow-sm" aria-hidden>
        <span className="absolute inset-x-1 top-1 h-1.5 rounded-sm bg-white" />
        <span className="absolute inset-x-1 top-3.5 h-1 rounded-sm bg-[#e1dfdd]" />
        <span className="absolute inset-x-1 top-5.5 h-1 rounded-sm bg-[#e1dfdd]" />
      </span>
    );
  }
  if (value === 'dark') {
    return (
      <span className="relative h-9 w-12 overflow-hidden rounded-md border border-[#3b3b3b] bg-[#1f1f1f] shadow-sm" aria-hidden>
        <span className="absolute inset-x-1 top-1 h-1.5 rounded-sm bg-[#292929]" />
        <span className="absolute inset-x-1 top-3.5 h-1 rounded-sm bg-[#3b3b3b]" />
        <span className="absolute inset-x-1 top-5.5 h-1 rounded-sm bg-[#3b3b3b]" />
      </span>
    );
  }
  return (
    <span className="relative flex h-9 w-12 overflow-hidden rounded-md border border-[#8a8886] shadow-sm" aria-hidden>
      <span className="w-1/2 bg-[#f3f2f1]" />
      <span className="w-1/2 bg-[#1f1f1f]" />
    </span>
  );
}

/** Outlook-style theme flyout: Light / Dark / Use system setting with preview tiles. */
export function ThemeMenu() {
  const [theme, setTheme] = useTheme();
  const { update } = usePreferences();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onPointer);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onPointer);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const apply = (next: ThemePreference) => {
    setTheme(next);
    if (isOnline()) update({ theme: next });
    setOpen(false);
  };

  const ActiveIcon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;

  return (
    <div ref={rootRef} className="relative">
      <IconButton
        label="Switch theme"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
        className={open ? 'bg-[var(--hub-surface-2)]' : undefined}
      >
        <ActiveIcon className="h-4.5 w-4.5" />
      </IconButton>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="Theme"
          className="hub-surface absolute top-full right-0 z-50 mt-1.5 w-72 origin-top-right animate-fade-in rounded-xl border p-2 shadow-xl"
        >
          <p className="px-2 pt-1 pb-2 text-xs font-semibold tracking-wide uppercase" style={{ color: 'var(--hub-muted)' }}>
            Switch theme
          </p>
          <ul className="space-y-0.5">
            {OPTIONS.map(({ value, label, hint, icon: Icon }) => {
              const selected = theme === value;
              return (
                <li key={value}>
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={selected}
                    onClick={() => apply(value)}
                    className={cn('flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors')}
                    style={
                      selected
                        ? { background: 'var(--hub-accent-soft)', color: 'var(--hub-accent-text)' }
                        : { color: 'var(--hub-text)' }
                    }
                    onMouseEnter={(e) => {
                      if (!selected) e.currentTarget.style.background = 'var(--hub-surface-2)';
                    }}
                    onMouseLeave={(e) => {
                      if (!selected) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <ThemePreview value={value} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-sm font-medium">
                        <Icon className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
                        {label}
                      </span>
                      <span className="mt-0.5 block text-[11px]" style={{ color: 'var(--hub-muted)' }}>
                        {hint}
                      </span>
                    </span>
                    {selected && <Check className="h-4 w-4 shrink-0" aria-hidden />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
