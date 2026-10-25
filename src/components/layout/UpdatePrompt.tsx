import { RefreshCw } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from '../ui/Button';

/** Registers the service worker and offers a reload when a new version has been downloaded. */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      // Check for updates hourly while the app stays open.
      setInterval(() => void registration.update().catch(() => undefined), 60 * 60 * 1000);
    },
  });

  if (!needRefresh) return null;
  return (
    <div role="status" className="fixed inset-x-4 bottom-20 z-[55] mx-auto flex max-w-sm items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 pl-4 shadow-xl lg:bottom-6 dark:border-slate-700 dark:bg-slate-900">
      <RefreshCw className="h-4 w-4 shrink-0 text-indigo-500" aria-hidden />
      <p className="flex-1 text-sm">A new version is available.</p>
      <Button size="sm" variant="ghost" onClick={() => setNeedRefresh(false)}>
        Later
      </Button>
      <Button size="sm" onClick={() => void updateServiceWorker(true)}>
        Reload
      </Button>
    </div>
  );
}
