import { AlertCircle, CloudOff, CloudUpload, ExternalLink, RefreshCw, Check, Plug } from 'lucide-react';
import { firebaseConfig } from '@/lib/firebase/config';
import { deriveStatus, type SyncState, type SyncStatus } from '@/lib/sync/syncStore';
import { useSyncState } from '@/hooks/useUtils';
import { cn } from '@/utils/cn';
import { formatRelative } from '@/utils/dates';

export const SYNC_COPY: Record<SyncStatus, { label: string; detail: string }> = {
  synced: { label: 'Synced', detail: 'All changes are saved in Firestore.' },
  syncing: { label: 'Saving…', detail: 'Sending recent changes to Firestore.' },
  connecting: { label: 'Connecting…', detail: 'Waiting for Firestore to confirm the latest data.' },
  offline: { label: 'Offline', detail: 'You are offline. Editing is paused until you reconnect; data on screen may be out of date.' },
  'offline-pending': {
    label: 'Offline · changes pending',
    detail: 'You are offline. Some changes have not reached Firestore yet; keep this tab open and they will be sent when you reconnect.',
  },
  error: { label: 'Sync issue', detail: 'The last change could not be saved. See the notification for details.' },
};

export function firestoreUsageUrl(projectId = firebaseConfig.projectId): string {
  return `https://console.firebase.google.com/project/${encodeURIComponent(projectId)}/firestore/databases/-default-/usage`;
}

export function connectionLabel(s: SyncState): string {
  if (!s.online) return 'Offline';
  if (s.awaitingServer) return 'Connecting…';
  return 'Connected';
}

export function SyncIndicator({ compact = false }: { compact?: boolean }) {
  const state = useSyncState();
  const status = deriveStatus(state);
  const copy = SYNC_COPY[status];
  const Icon = { synced: Check, syncing: RefreshCw, connecting: Plug, offline: CloudOff, 'offline-pending': CloudUpload, error: AlertCircle }[status];
  const title = `${copy.detail}${state.lastSyncedAt ? ` Last synced ${formatRelative(new Date(state.lastSyncedAt))}.` : ''}`;

  return (
    <div
      role="status"
      aria-live="polite"
      title={title}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
        status === 'synced' && 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400',
        (status === 'syncing' || status === 'connecting') && 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300',
        status === 'offline' && 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
        status === 'offline-pending' && 'bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300',
        status === 'error' && 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300',
      )}
    >
      <Icon className={cn('h-3.5 w-3.5', status === 'syncing' && 'animate-spin')} aria-hidden />
      <span className={cn(compact && 'sr-only sm:not-sr-only')}>{copy.label}</span>
    </div>
  );
}

/** Firebase connection, pending writes and last sync, plus a link to Firestore usage (dashboard + settings). */
export function SyncDetails() {
  const state = useSyncState();
  const status = deriveStatus(state);
  const pendingWrites = state.inFlightWrites || (state.snapshotPending ? 'Yes' : 0);
  return (
    <div className="space-y-4 text-sm">
      <p className="text-slate-600 dark:text-slate-400">{SYNC_COPY[status].detail}</p>
      <dl className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
        <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
          <dt className="text-slate-500">Firebase connection</dt>
          <dd className="mt-0.5 font-medium">{connectionLabel(state)}</dd>
        </div>
        <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
          <dt className="text-slate-500">Pending writes</dt>
          <dd className="mt-0.5 font-medium">{pendingWrites}</dd>
        </div>
        <div className="col-span-2 rounded-xl bg-slate-50 p-3 sm:col-span-1 dark:bg-slate-800/60">
          <dt className="text-slate-500">Last synced</dt>
          <dd className="mt-0.5 font-medium">{state.lastSyncedAt ? formatRelative(new Date(state.lastSyncedAt)) : '—'}</dd>
        </div>
      </dl>
      <a
        href={firestoreUsageUrl()}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
      >
        Firestore usage in Firebase Console <ExternalLink className="h-3.5 w-3.5" aria-hidden />
      </a>
    </div>
  );
}
