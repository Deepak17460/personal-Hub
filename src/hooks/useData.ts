import { useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/features/auth/session';
import { INDEX_RETRY_DELAYS_MS, isIndexBuilding, useLiveCollection, useLiveDoc, type LiveState } from '@/lib/firestore/liveQuery';
import { mapSnapshot } from '@/repositories/mappers';
import { docRef, preferencesRef } from '@/repositories/paths';
import { DEFAULT_PREFERENCES, mapPreferences, savePreferences } from '@/repositories/preferences';
import { fetchTaskCounts, queries, searchCollection } from '@/repositories/queries';
import type { CollectionName, Note, Preferences, RecordOf } from '@/types/models';
import { queryTerms } from '@/utils/searchTokens';
import { useDebouncedValue } from './useUtils';

/** Most recently updated records of a collection, newest first. */
export function useRecent<C extends CollectionName>(c: C, n: number): LiveState<RecordOf<C>[]> {
  const { db, uid } = useSession();
  return useLiveCollection(`${uid}/${c}/recent/${n}`, () => queries.recent(db, uid, c, n), (s) => mapSnapshot(c, s));
}

export const PAGE_SIZE = 100;

/** Paginated list: grows the listener window by PAGE_SIZE on "Load more". */
export function usePagedCollection<C extends CollectionName>(c: C) {
  const [count, setCount] = useState(PAGE_SIZE);
  const state = useRecent(c, count);
  const hasMore = (state.data?.length ?? 0) >= count;
  const loadMore = useCallback(() => setCount((n) => n + PAGE_SIZE), []);
  return { ...state, hasMore, loadMore };
}

export function useNote(id: string | undefined): LiveState<Note | null> {
  const { db, uid } = useSession();
  return useLiveDoc(id ? `${uid}/notes/doc/${id}` : null, () => docRef(db, uid, 'notes', id!), (s) => mapSnapshot('notes', s));
}

export function useOpenTasksDueBy(date: string, n = 20) {
  const { db, uid } = useSession();
  return useLiveCollection(`${uid}/tasks/dueBy/${date}/${n}`, () => queries.openTasksDueBy(db, uid, date, n), (s) => mapSnapshot('tasks', s));
}

export function useTasksDueBetween(from: string, to: string) {
  const { db, uid } = useSession();
  return useLiveCollection(`${uid}/tasks/between/${from}/${to}`, () => queries.tasksDueBetween(db, uid, from, to), (s) => mapSnapshot('tasks', s));
}

export function useEventsBetween(from: string, to: string) {
  const { db, uid } = useSession();
  return useLiveCollection(`${uid}/events/between/${from}/${to}`, () => queries.eventsBetween(db, uid, from, to), (s) => mapSnapshot('events', s));
}

export function useRecurringEvents() {
  const { db, uid } = useSession();
  return useLiveCollection(`${uid}/events/recurring`, () => queries.recurringEvents(db, uid), (s) => mapSnapshot('events', s));
}

export function useFavoriteBookmarks(n = 8) {
  const { db, uid } = useSession();
  return useLiveCollection(`${uid}/bookmarks/favorites/${n}`, () => queries.favoriteBookmarks(db, uid, n), (s) => mapSnapshot('bookmarks', s));
}

export function useTaskCounts(today: string) {
  const { db, uid } = useSession();
  return useQuery({
    queryKey: ['task-counts', uid, today],
    queryFn: () => fetchTaskCounts(db, uid, today),
    staleTime: 5 * 60_000,
    retry: (failures, error) => isIndexBuilding(error as { code?: string }) && failures < INDEX_RETRY_DELAYS_MS.length,
    retryDelay: (attempt) => INDEX_RETRY_DELAYS_MS[Math.min(attempt, INDEX_RETRY_DELAYS_MS.length - 1)]!,
    networkMode: 'online',
  });
}

export function usePreferences(): { prefs: Preferences; loading: boolean; update: (patch: Partial<Preferences>) => void } {
  const { db, uid } = useSession();
  const state = useLiveDoc(`${uid}/settings/preferences`, () => preferencesRef(db, uid), mapPreferences);
  const prefs = state.data ?? DEFAULT_PREFERENCES;
  const update = useCallback(
    (patch: Partial<Preferences>) => {
      void savePreferences(db, uid, { ...prefs, ...patch }).catch(() => undefined);
    },
    [db, uid, prefs],
  );
  return { prefs, loading: state.loading, update };
}

export type SearchResults = { [C in CollectionName]: RecordOf<C>[] };

/** Debounced, indexed search across collections (one bounded query per collection). */
export function useSearch(text: string, collections: readonly CollectionName[], perCollection = 8) {
  const { db, uid } = useSession();
  const debounced = useDebouncedValue(text.trim(), 300);
  const enabled = queryTerms(debounced).length > 0;
  return useQuery({
    queryKey: ['search', uid, debounced, collections.join(','), perCollection],
    enabled,
    staleTime: 30_000,
    networkMode: 'always',
    queryFn: async () => {
      const entries = await Promise.all(
        collections.map(async (c) => [c, await searchCollection(db, uid, c, debounced, perCollection)] as const),
      );
      const out = { notes: [], tasks: [], bookmarks: [], documents: [], events: [] } as SearchResults;
      for (const [c, rows] of entries) (out as Record<string, unknown>)[c] = rows;
      return out;
    },
  });
}
