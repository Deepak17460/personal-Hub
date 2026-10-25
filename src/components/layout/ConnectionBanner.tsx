import { useEffect, useState } from 'react';
import { CloudOff, DatabaseZap } from 'lucide-react';
import { getCacheMode, retireLegacyOfflineCache, type LegacyRetireResult } from '@/lib/firebase/client';
import { hasUnsavedWrites } from '@/lib/sync/syncStore';
import { useSyncState } from '@/hooks/useUtils';

/** Shown while offline: data lives only in Firestore, so editing is paused until reconnecting. */
export function OfflineBanner() {
  const state = useSyncState();
  if (state.online) return null;
  const pending = hasUnsavedWrites(state);
  return (
    <div role="alert" className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 sm:px-6 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
      <p className="mx-auto flex max-w-7xl items-start gap-2">
        <CloudOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>
          <strong className="font-semibold">You are offline.</strong> Your data is stored only in Firestore, so editing is paused until you reconnect. What
          is on screen may be out of date.
          {pending && ' Some changes are still waiting to upload — keep this tab open and they will be sent when the connection returns.'}
        </span>
      </p>
    </div>
  );
}

/**
 * Earlier versions kept an offline copy of Firestore in IndexedDB. On a device that still has it,
 * wait until every change queued there is confirmed by Firestore, then delete it and reload into
 * the memory-only mode. Nothing is deleted before the server has acknowledged it.
 */
export function LegacyCacheMigration() {
  const [status, setStatus] = useState<'idle' | 'draining' | LegacyRetireResult>(() => (getCacheMode() === 'legacy' ? 'draining' : 'idle'));

  useEffect(() => {
    if (getCacheMode() !== 'legacy') return;
    let cancelled = false;
    retireLegacyOfflineCache()
      .then((result) => {
        if (cancelled) return;
        setStatus(result);
        if (result === 'retired') window.location.reload();
      })
      .catch(() => !cancelled && setStatus('other-tabs-open'));
    return () => {
      cancelled = true;
    };
  }, []);

  if (status === 'idle' || status === 'not-needed' || status === 'retired') return null;
  return (
    <div role="status" className="border-b border-sky-200 bg-sky-50 px-4 py-2.5 text-sm text-sky-900 sm:px-6 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200">
      <p className="mx-auto flex max-w-7xl items-start gap-2">
        <DatabaseZap className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>
          {status === 'draining'
            ? 'Moving to cloud-only storage: uploading any changes this device saved offline earlier. The old on-device copy is removed only after Firestore confirms them.'
            : 'Your earlier offline changes are saved in Firestore. Close other Personal Hub tabs and reload to finish removing the old on-device copy.'}
        </span>
      </p>
    </div>
  );
}
