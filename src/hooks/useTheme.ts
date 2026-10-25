import { useEffect, useSyncExternalStore } from 'react';
import type { ThemePreference } from '@/types/models';

const KEY = 'ph-theme';
const listeners = new Set<() => void>();

function read(): ThemePreference {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' || v === 'system' ? v : 'system';
  } catch {
    return 'system';
  }
}

let current: ThemePreference = typeof window === 'undefined' ? 'system' : read();

function systemDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
}

export function applyTheme(pref: ThemePreference): void {
  const dark = pref === 'dark' || (pref === 'system' && systemDark());
  document.documentElement.classList.toggle('dark', dark);
}

/** Theme preference is kept in localStorage for an instant first paint (not sensitive data). */
export const themeStore = {
  get: () => current,
  set(pref: ThemePreference) {
    current = pref;
    try {
      localStorage.setItem(KEY, pref);
    } catch {
      /* storage unavailable */
    }
    applyTheme(pref);
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export function useTheme(): [ThemePreference, (pref: ThemePreference) => void] {
  const theme = useSyncExternalStore(themeStore.subscribe, themeStore.get, themeStore.get);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const onChange = () => themeStore.get() === 'system' && applyTheme('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return [theme, themeStore.set];
}
