import { useEffect, useState, useSyncExternalStore } from 'react';
import { syncStore, type SyncState } from '@/lib/sync/syncStore';

export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

export function useSyncState(): SyncState {
  return useSyncExternalStore(syncStore.subscribe, syncStore.getState, syncStore.getState);
}

/** Current time, refreshed on an interval (default every 30 s). */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const installListeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    installListeners.forEach((l) => l());
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    installListeners.forEach((l) => l());
  });
}

/** Chromium-only install prompt; other browsers need manual "Add to Home Screen". */
export function useInstallPrompt(): { canInstall: boolean; install: () => Promise<boolean>; installed: boolean } {
  const available = useSyncExternalStore(
    (l) => {
      installListeners.add(l);
      return () => installListeners.delete(l);
    },
    () => deferredPrompt !== null,
    () => false,
  );
  const installed = typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches;
  return {
    canInstall: available,
    installed: Boolean(installed),
    install: async () => {
      if (!deferredPrompt) return false;
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      deferredPrompt = null;
      installListeners.forEach((l) => l());
      return choice.outcome === 'accepted';
    },
  };
}
