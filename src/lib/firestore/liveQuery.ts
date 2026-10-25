import { useCallback, useSyncExternalStore } from 'react';
import {
  onSnapshot,
  type DocumentReference,
  type DocumentSnapshot,
  type FirestoreError,
  type Query,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { syncStore } from '@/lib/sync/syncStore';

export interface LiveState<T> {
  data: T | undefined;
  error: FirestoreError | null;
  loading: boolean;
  fromCache: boolean;
  hasPendingWrites: boolean;
}

interface Entry {
  state: LiveState<unknown>;
  listeners: Set<() => void>;
  refs: number;
  unsubscribe: (() => void) | null;
  releaseTimer: ReturnType<typeof setTimeout> | null;
  retryTimer: ReturnType<typeof setTimeout> | null;
  attempts: number;
}

type Starter = (emit: (patch: Partial<LiveState<unknown>>) => void) => () => void;

const LOADING: LiveState<never> = { data: undefined, error: null, loading: true, fromCache: true, hasPendingWrites: false };
const IDLE: LiveState<never> = { data: undefined, error: null, loading: false, fromCache: true, hasPendingWrites: false };

/** Keep listeners briefly after the last consumer unmounts so quick navigation does not re-read data. */
const RELEASE_DELAY_MS = 20_000;

/**
 * Firestore ends a listener with `failed-precondition` while a required composite index is
 * still building (e.g. right after `firebase deploy --only firestore:indexes`). Such errors heal
 * on their own, so the listener is restarted with backoff instead of staying failed until reload.
 */
export const INDEX_RETRY_DELAYS_MS = [10_000, 20_000, 30_000, 60_000, 120_000];
/** About 40 minutes of retrying; a genuinely missing index should not poll forever. */
const MAX_INDEX_RETRIES = 22;

export function isIndexBuilding(error: { code?: string } | null | undefined): boolean {
  return error?.code === 'failed-precondition';
}

const entries = new Map<string, Entry>();

function startEntry(e: Entry, start: Starter): void {
  e.unsubscribe = start((patch) => {
    e.state = { ...e.state, ...patch, loading: false };
    if (patch.error === null) e.attempts = 0;
    e.listeners.forEach((l) => l());
    if (isIndexBuilding(patch.error) && !e.retryTimer && e.attempts < MAX_INDEX_RETRIES) {
      const delay = INDEX_RETRY_DELAYS_MS[Math.min(e.attempts, INDEX_RETRY_DELAYS_MS.length - 1)];
      e.attempts++;
      e.retryTimer = setTimeout(() => {
        e.retryTimer = null;
        e.unsubscribe?.();
        startEntry(e, start);
      }, delay);
    }
  });
}

function stopEntry(e: Entry): void {
  if (e.releaseTimer) clearTimeout(e.releaseTimer);
  if (e.retryTimer) clearTimeout(e.retryTimer);
  e.retryTimer = null;
  e.unsubscribe?.();
}

function acquire(key: string, start: Starter): Entry {
  let entry = entries.get(key);
  if (!entry) {
    entry = { state: LOADING, listeners: new Set(), refs: 0, unsubscribe: null, releaseTimer: null, retryTimer: null, attempts: 0 };
    entries.set(key, entry);
    startEntry(entry, start);
  }
  if (entry.releaseTimer) {
    clearTimeout(entry.releaseTimer);
    entry.releaseTimer = null;
  }
  entry.refs++;
  return entry;
}

function release(key: string): void {
  const entry = entries.get(key);
  if (!entry) return;
  entry.refs--;
  if (entry.refs > 0) return;
  entry.releaseTimer = setTimeout(() => {
    stopEntry(entry);
    entries.delete(key);
    syncStore.unregister(key);
  }, RELEASE_DELAY_MS);
}

/** Stops every listener immediately (used on sign-out). */
export function disposeAllLiveQueries(): void {
  for (const [key, entry] of entries) {
    stopEntry(entry);
    syncStore.unregister(key);
  }
  entries.clear();
}

/**
 * Shared realtime subscription: components using the same key share a single Firestore listener.
 * The key must encode every parameter of the query.
 */
function useLive<T>(key: string | null, start: Starter): LiveState<T> {
  // `start` is intentionally not a dependency: its parameters are encoded in `key`.
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!key) return () => {};
      const entry = acquire(key, start);
      entry.listeners.add(onChange);
      return () => {
        entry.listeners.delete(onChange);
        release(key);
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
  const getSnapshot = useCallback(() => {
    if (!key) return IDLE;
    return (entries.get(key)?.state ?? LOADING) as LiveState<T>;
  }, [key]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useLiveCollection<T>(
  key: string | null,
  makeQuery: () => Query,
  map: (snap: QueryDocumentSnapshot) => T,
): LiveState<T[]> {
  return useLive<T[]>(key, (emit) =>
    onSnapshot(
      makeQuery(),
      { includeMetadataChanges: true },
      (snap) => {
        syncStore.reportSnapshot(key!, snap.metadata);
        emit({
          data: snap.docs.map(map),
          error: null,
          fromCache: snap.metadata.fromCache,
          hasPendingWrites: snap.metadata.hasPendingWrites,
        });
      },
      (error) => emit({ error }),
    ),
  );
}

export function useLiveDoc<T>(
  key: string | null,
  makeRef: () => DocumentReference,
  map: (snap: DocumentSnapshot) => T | null,
): LiveState<T | null> {
  return useLive<T | null>(key, (emit) =>
    onSnapshot(
      makeRef(),
      { includeMetadataChanges: true },
      (snap) => {
        syncStore.reportSnapshot(key!, snap.metadata);
        emit({
          data: snap.exists() ? map(snap) : null,
          error: null,
          fromCache: snap.metadata.fromCache,
          hasPendingWrites: snap.metadata.hasPendingWrites,
        });
      },
      (error) => emit({ error }),
    ),
  );
}
