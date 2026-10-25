import { friendlyDataError } from '@/lib/firebase/errors';

export type SyncStatus = 'offline' | 'offline-pending' | 'connecting' | 'syncing' | 'synced' | 'error';

export interface SyncState {
  online: boolean;
  /** Writes issued in this session that the server has not yet acknowledged. */
  inFlightWrites: number;
  /** Any active listener reports local changes not yet committed. */
  snapshotPending: boolean;
  /** At least one active listener is showing data the Firestore server has not confirmed yet. */
  awaitingServer: boolean;
  lastSyncedAt: number | null;
  lastError: string | null;
}

export type SyncEvent =
  | { type: 'error'; message: string }
  | { type: 'conflict'; message: string };

export const OFFLINE_WRITE_MESSAGE = 'You are offline, so this change was not saved. Reconnect and try again.';

/** Thrown (as a rejected write) when a change is attempted without a connection. */
export class OfflineWriteError extends Error {
  readonly code = 'offline';
  constructor() {
    super(OFFLINE_WRITE_MESSAGE);
    this.name = 'OfflineWriteError';
  }
}

let state: SyncState = {
  online: typeof navigator === 'undefined' || navigator.onLine !== false,
  inFlightWrites: 0,
  snapshotPending: false,
  awaitingServer: false,
  lastSyncedAt: null,
  lastError: null,
};

const listeners = new Set<() => void>();
const eventListeners = new Set<(e: SyncEvent) => void>();
const metaByKey = new Map<string, { hasPendingWrites: boolean; fromCache: boolean }>();

function set(patch: Partial<SyncState>): void {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function aggregate(): Pick<SyncState, 'snapshotPending' | 'awaitingServer'> {
  const metas = [...metaByKey.values()];
  return { snapshotPending: metas.some((m) => m.hasPendingWrites), awaitingServer: metas.some((m) => m.fromCache) };
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
    metaByKey.set(key, { hasPendingWrites: meta.hasPendingWrites, fromCache: meta.fromCache });
    const agg = aggregate();
    const patch: Partial<SyncState> = agg;
    if (!meta.fromCache && !agg.snapshotPending && state.inFlightWrites === 0) patch.lastSyncedAt = Date.now();
    set(patch);
  },
  unregister(key: string): void {
    metaByKey.delete(key);
    set(aggregate());
  },
  reset(): void {
    metaByKey.clear();
    set({ inFlightWrites: 0, snapshotPending: false, awaitingServer: false, lastError: null });
  },
};

export function isOnline(): boolean {
  return state.online;
}

export const OFFLINE_READ_MESSAGE = 'You are offline. Your data is stored only in Firestore, so connect to the internet to load it.';

/** For one-off reads (export, import, search) that must come from the server, not a partial memory cache. */
export function requireConnection(): void {
  if (!state.online) throw Object.assign(new Error(OFFLINE_READ_MESSAGE), { code: 'offline' });
}

/**
 * Starts a Firestore write and tracks it until the server acknowledges it. Writes are refused
 * while offline: with a memory-only cache a queued write would be lost if the tab closed before
 * reconnecting, so nothing is attempted and the returned promise rejects with OfflineWriteError.
 */
export function trackWrite<T>(start: () => Promise<T>, opts: { silent?: boolean } = {}): Promise<T> {
  if (!state.online) {
    set({ lastError: OFFLINE_WRITE_MESSAGE });
    if (!opts.silent) syncStore.emit({ type: 'error', message: OFFLINE_WRITE_MESSAGE });
    return Promise.reject(new OfflineWriteError());
  }
  set({ inFlightWrites: state.inFlightWrites + 1 });
  return start().then(
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

export function hasUnsavedWrites(s: SyncState = state): boolean {
  return s.inFlightWrites > 0 || s.snapshotPending;
}

export function deriveStatus(s: SyncState): SyncStatus {
  const pending = hasUnsavedWrites(s);
  if (!s.online) return pending ? 'offline-pending' : 'offline';
  if (pending) return 'syncing';
  if (s.lastError) return 'error';
  if (s.awaitingServer) return 'connecting';
  return 'synced';
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    syncStore.setOnline(true);
    if (state.lastError === OFFLINE_WRITE_MESSAGE) syncStore.clearError();
  });
  window.addEventListener('offline', () => syncStore.setOnline(false));
  // Writes still in flight live only in memory; closing the tab now would drop them.
  window.addEventListener('beforeunload', (e) => {
    if (hasUnsavedWrites()) e.preventDefault();
  });
}
