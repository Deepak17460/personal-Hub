import { AlertCircle, CloudOff, CloudUpload, RefreshCw, Check } from 'lucide-react';
import { deriveStatus, type SyncStatus } from '@/lib/sync/syncStore';
import { useSyncState } from '@/hooks/useUtils';
import { cn } from '@/utils/cn';
import { formatRelative } from '@/utils/dates';

export const SYNC_COPY: Record<SyncStatus, { label: string; detail: string }> = {
  synced: { label: 'Synced', detail: 'All changes are saved to the cloud.' },
  syncing: { label: 'Syncing…', detail: 'Uploading recent changes.' },
  offline: { label: 'Offline', detail: 'You are offline. Saved data on this device is still available.' },
  'offline-pending': {
    label: 'Offline · changes pending',
    detail: 'Changes are saved on this device and will sync automatically when you reconnect.',
  },
  error: { label: 'Sync issue', detail: 'The last change could not be saved. See the notification for details.' },
};

export function SyncIndicator({ compact = false }: { compact?: boolean }) {
  const state = useSyncState();
  const status = deriveStatus(state);
  const copy = SYNC_COPY[status];
  const Icon = { synced: Check, syncing: RefreshCw, offline: CloudOff, 'offline-pending': CloudUpload, error: AlertCircle }[status];
  const title = `${copy.detail}${state.lastSyncedAt ? ` Last synced ${formatRelative(new Date(state.lastSyncedAt))}.` : ''}`;

  return (
    <div
      role="status"
      aria-live="polite"
      title={title}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
        status === 'synced' && 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400',
        status === 'syncing' && 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300',
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
