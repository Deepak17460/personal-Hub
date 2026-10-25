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
}

type Starter = (emit: (patch: Partial<LiveState<unknown>>) => void) => () => void;

const LOADING: LiveState<never> = { data: undefined, error: null, loading: true, fromCache: true, hasPendingWrites: false };
const IDLE: LiveState<never> = { data: undefined, error: null, loading: false, fromCache: true, hasPendingWrites: false };

/** Keep listeners briefly after the last consumer unmounts so quick navigation does not re-read data. */
const RELEASE_DELAY_MS = 20_000;

const entries = new Map<string, Entry>();

function acquire(key: string, start: Starter): Entry {
  let entry = entries.get(key);
  if (!entry) {
    entry = { state: LOADING, listeners: new Set(), refs: 0, unsubscribe: null, releaseTimer: null };
    entries.set(key, entry);
    const e = entry;
    e.unsubscribe = start((patch) => {
      e.state = { ...e.state, ...patch, loading: false };
      e.listeners.forEach((l) => l());
    });
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
    entry.unsubscribe?.();
    entries.delete(key);
    syncStore.unregister(key);
  }, RELEASE_DELAY_MS);
}

/** Stops every listener immediately (used on sign-out). */
export function disposeAllLiveQueries(): void {
  for (const [key, entry] of entries) {
    if (entry.releaseTimer) clearTimeout(entry.releaseTimer);
    entry.unsubscribe?.();
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
