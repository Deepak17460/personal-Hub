import { friendlyDataError } from '@/lib/firebase/errors';

export type SyncStatus = 'offline' | 'offline-pending' | 'syncing' | 'synced' | 'error';

export interface SyncState {
  online: boolean;
  /** Writes issued in this session that the server has not yet acknowledged. */
  inFlightWrites: number;
  /** Any active listener reports local changes not yet committed (also covers writes queued before a reload). */
  snapshotPending: boolean;
  lastSyncedAt: number | null;
  lastError: string | null;
}

export type SyncEvent =
  | { type: 'error'; message: string }
  | { type: 'conflict'; message: string };

let state: SyncState = {
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  inFlightWrites: 0,
  snapshotPending: false,
  lastSyncedAt: null,
  lastError: null,
};

const listeners = new Set<() => void>();
const eventListeners = new Set<(e: SyncEvent) => void>();
const pendingByKey = new Map<string, boolean>();

function set(patch: Partial<SyncState>): void {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export const syncStore = {
  getState: (): SyncState => state,
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  onEvent(listener: (e: SyncEvent) => void): () => void {
    eventListeners.add(listener);
    return () => eventListeners.delete(listener);
  },
  emit(event: SyncEvent): void {
    eventListeners.forEach((l) => l(event));
  },
  setOnline(online: boolean): void {
    set({ online });
  },
  clearError(): void {
    if (state.lastError) set({ lastError: null });
  },
  reportSnapshot(key: string, meta: { hasPendingWrites: boolean; fromCache: boolean }): void {
    pendingByKey.set(key, meta.hasPendingWrites);
    const snapshotPending = [...pendingByKey.values()].some(Boolean);
    const patch: Partial<SyncState> = { snapshotPending };
    if (!meta.fromCache && !snapshotPending && state.inFlightWrites === 0) patch.lastSyncedAt = Date.now();
    set(patch);
  },
  unregister(key: string): void {
    pendingByKey.delete(key);
    set({ snapshotPending: [...pendingByKey.values()].some(Boolean) });
  },
  reset(): void {
    pendingByKey.clear();
    set({ inFlightWrites: 0, snapshotPending: false, lastError: null });
  },
};

/**
 * Wraps a Firestore write promise. The promise resolves only once the server acknowledges the
 * write, which may be much later when offline, so UI code should not await it for feedback.
 */
export function trackWrite<T>(promise: Promise<T>, opts: { silent?: boolean } = {}): Promise<T> {
  set({ inFlightWrites: state.inFlightWrites + 1 });
  return promise.then(
    (value) => {
      const inFlightWrites = Math.max(0, state.inFlightWrites - 1);
      set({ inFlightWrites, lastError: null, ...(inFlightWrites === 0 ? { lastSyncedAt: Date.now() } : {}) });
      return value;
    },
    (error: unknown) => {
      const message = friendlyDataError(error);
      set({ inFlightWrites: Math.max(0, state.inFlightWrites - 1), lastError: message });
      if (!opts.silent) syncStore.emit({ type: 'error', message });
      throw error;
    },
  );
}

export function deriveStatus(s: SyncState): SyncStatus {
  const pending = s.inFlightWrites > 0 || s.snapshotPending;
  if (!s.online) return pending ? 'offline-pending' : 'offline';
  if (pending) return 'syncing';
  if (s.lastError) return 'error';
  return 'synced';
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => syncStore.setOnline(true));
  window.addEventListener('offline', () => syncStore.setOnline(false));
}
