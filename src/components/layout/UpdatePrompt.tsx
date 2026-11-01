import { useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from '../ui/Button';

function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    // iOS Safari "Add to Home Screen"
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  );
}

/** Registers the service worker; auto-applies updates (critical for the installed PWA). */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      const check = () => void registration.update().catch(() => undefined);
      check();
      // Installed apps stay open for days — recheck when the user comes back.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
      setInterval(check, 30 * 60 * 1000);
    },
  });

  // Standalone builds often miss the toast; apply the waiting worker without asking.
  useEffect(() => {
    if (!needRefresh || !isStandaloneDisplay()) return;
    const t = window.setTimeout(() => void updateServiceWorker(true), 400);
    return () => window.clearTimeout(t);
  }, [needRefresh, updateServiceWorker]);

  if (!needRefresh || isStandaloneDisplay()) return null;

  return (
    <div
      role="status"
      className="hub-surface fixed inset-x-4 bottom-20 z-[55] mx-auto flex max-w-md items-center gap-3 rounded-2xl border p-3 pl-4 shadow-xl lg:bottom-6"
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white"
        style={{ background: 'var(--hub-accent)' }}
        aria-hidden
      >
        <RefreshCw className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold" style={{ color: 'var(--hub-text)' }}>
          Update ready
        </p>
        <p className="text-xs" style={{ color: 'var(--hub-muted)' }}>
          A newer version of Personal Hub is available. Reload to get it.
        </p>
      </div>
      <Button size="sm" variant="ghost" onClick={() => setNeedRefresh(false)}>
        Later
      </Button>
      <Button size="sm" className="!bg-[var(--hub-accent)] hover:!brightness-110" onClick={() => void updateServiceWorker(true)}>
        Reload
      </Button>
    </div>
  );
}
