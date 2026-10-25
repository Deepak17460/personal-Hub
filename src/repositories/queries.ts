import {
  getCountFromServer,
  getDocs,
  getDocsFromCache,
  limit,
  orderBy,
  query,
  where,
  type Firestore,
  type Query,
} from 'firebase/firestore';
import type { CollectionName, RecordOf } from '@/types/models';
import { matchesAllTerms, primaryTerm, queryTerms } from '@/utils/searchTokens';
import { mapSnapshot } from './mappers';
import { colRef } from './paths';

/**
 * All queries are bounded (limit) and use single-field or declared composite indexes
 * (firebase/firestore.indexes.json). Keys passed to live hooks must encode every parameter.
 */
export const queries = {
  recent(db: Firestore, uid: string, c: CollectionName, n: number): Query {
    return query(colRef(db, uid, c), orderBy('updatedAt', 'desc'), limit(n));
  },
  openTasksDueBy(db: Firestore, uid: string, date: string, n: number): Query {
    return query(
      colRef(db, uid, 'tasks'),
      where('status', 'in', ['todo', 'in_progress']),
      where('dueDate', '<=', date),
      orderBy('dueDate', 'asc'),
      limit(n),
    );
  },
  tasksDueBetween(db: Firestore, uid: string, from: string, to: string): Query {
    return query(colRef(db, uid, 'tasks'), where('dueDate', '>=', from), where('dueDate', '<=', to), orderBy('dueDate'), limit(300));
  },
  eventsBetween(db: Firestore, uid: string, from: string, to: string): Query {
    return query(colRef(db, uid, 'events'), where('date', '>=', from), where('date', '<=', to), orderBy('date'), limit(300));
  },
  recurringEvents(db: Firestore, uid: string): Query {
    return query(colRef(db, uid, 'events'), where('recurrence.freq', 'in', ['daily', 'weekly', 'monthly', 'yearly']), limit(300));
  },
  favoriteBookmarks(db: Firestore, uid: string, n: number): Query {
    return query(colRef(db, uid, 'bookmarks'), where('favorite', '==', true), orderBy('updatedAt', 'desc'), limit(n));
  },
};

export interface TaskCounts {
  open: number;
  done: number;
  overdue: number;
}

/** Aggregation queries cost ~1 read per 1,000 matching index entries. Online only. */
export async function fetchTaskCounts(db: Firestore, uid: string, today: string): Promise<TaskCounts> {
  const tasks = colRef(db, uid, 'tasks');
  const [open, done, overdue] = await Promise.all([
    getCountFromServer(query(tasks, where('status', 'in', ['todo', 'in_progress']))),
    getCountFromServer(query(tasks, where('status', '==', 'done'))),
    getCountFromServer(query(tasks, where('status', 'in', ['todo', 'in_progress']), where('dueDate', '<', today))),
  ]);
  return { open: open.data().count, done: done.data().count, overdue: overdue.data().count };
}

/**
 * Indexed search: one `array-contains` query on the most selective term, remaining terms
 * filtered client-side. Falls back to the local cache while offline.
 */
export async function searchCollection<C extends CollectionName>(
  db: Firestore,
  uid: string,
  c: C,
  text: string,
  max = 10,
): Promise<RecordOf<C>[]> {
  const terms = queryTerms(text);
  const term = primaryTerm(terms);
  if (!term) return [];
  const q = query(colRef(db, uid, c), where('searchTokens', 'array-contains', term), limit(max * 3));
  const online = typeof navigator === 'undefined' || navigator.onLine;
  const snap = online ? await getDocs(q) : await getDocsFromCache(q);
  return snap.docs
    .filter((d) => matchesAllTerms(d.get('searchTokens') as string[] | undefined, terms))
    .slice(0, max)
    .map((d) => mapSnapshot(c, d));
}
