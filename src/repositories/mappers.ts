import type { DocumentData, DocumentSnapshot } from 'firebase/firestore';
import type {
  BaseRecord,
  Bookmark,
  CalendarEvent,
  CollectionName,
  DocumentRecord,
  Note,
  Recurrence,
  RecordOf,
  Subtask,
  Task,
} from '@/types/models';
import { buildSearchTokens } from '@/utils/searchTokens';
import { hostnameOf } from '@/utils/url';

export const SCHEMA_VERSION: Record<CollectionName, number> = {
  notes: 1,
  tasks: 1,
  bookmarks: 1,
  documents: 1,
  events: 1,
};

export function toDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (value && typeof value === 'object' && 'toDate' in value && typeof (value as { toDate: unknown }).toDate === 'function') {
    return (value as { toDate(): Date }).toDate();
  }
  return null;
}

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const bool = (v: unknown): boolean => v === true;
const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const nullableStr = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const nullableNum = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function recurrence(v: unknown): Recurrence {
  if (v && typeof v === 'object') {
    const r = v as Partial<Recurrence>;
    if (r.freq && ['none', 'daily', 'weekly', 'monthly', 'yearly'].includes(r.freq)) {
      return { freq: r.freq, interval: typeof r.interval === 'number' && r.interval >= 1 ? r.interval : 1 };
    }
  }
  return { freq: 'none', interval: 1 };
}

function base(id: string, d: DocumentData, pending: boolean): BaseRecord {
  return {
    id,
    createdAt: toDate(d.createdAt) ?? new Date(),
    updatedAt: toDate(d.updatedAt) ?? new Date(),
    schemaVersion: typeof d.schemaVersion === 'number' ? d.schemaVersion : 1,
    searchTokens: strArr(d.searchTokens),
    pending,
  };
}

export function mapData<C extends CollectionName>(collection: C, id: string, d: DocumentData, pending = false): RecordOf<C> {
  const b = base(id, d, pending);
  switch (collection) {
    case 'notes':
      return {
        ...b,
        title: str(d.title),
        content: str(d.content),
        category: str(d.category),
        tags: strArr(d.tags),
        pinned: bool(d.pinned),
        archived: bool(d.archived),
        revId: str(d.revId, 'initial'),
        prevRevId: nullableStr(d.prevRevId),
      } satisfies Note as RecordOf<C>;
    case 'tasks':
      return {
        ...b,
        title: str(d.title),
        description: str(d.description),
        priority: ['low', 'medium', 'high', 'critical'].includes(d.priority) ? d.priority : 'medium',
        status: ['todo', 'in_progress', 'done'].includes(d.status) ? d.status : 'todo',
        dueDate: nullableStr(d.dueDate),
        category: str(d.category),
        tags: strArr(d.tags),
        subtasks: Array.isArray(d.subtasks)
          ? (d.subtasks as Subtask[]).filter((s) => s && typeof s.id === 'string' && typeof s.title === 'string')
          : [],
        recurrence: recurrence(d.recurrence),
        completedAt: toDate(d.completedAt),
      } satisfies Task as RecordOf<C>;
    case 'bookmarks':
      return {
        ...b,
        url: str(d.url),
        title: str(d.title),
        description: str(d.description),
        category: str(d.category),
        tags: strArr(d.tags),
        favorite: bool(d.favorite),
      } satisfies Bookmark as RecordOf<C>;
    case 'documents':
      return {
        ...b,
        title: str(d.title),
        description: str(d.description),
        category: str(d.category),
        tags: strArr(d.tags),
        externalUrl: nullableStr(d.externalUrl),
        storageProvider: str(d.storageProvider),
        fileType: str(d.fileType),
        fileSizeBytes: nullableNum(d.fileSizeBytes),
      } satisfies DocumentRecord as RecordOf<C>;
    case 'events':
      return {
        ...b,
        title: str(d.title),
        description: str(d.description),
        date: str(d.date),
        time: nullableStr(d.time),
        kind: ['event', 'important', 'reminder'].includes(d.kind) ? d.kind : 'event',
        recurrence: recurrence(d.recurrence),
        reminderMinutes: nullableNum(d.reminderMinutes),
      } satisfies CalendarEvent as RecordOf<C>;
    default:
      throw new Error(`Unknown collection ${String(collection)}`);
  }
}

export function mapSnapshot<C extends CollectionName>(collection: C, snap: DocumentSnapshot): RecordOf<C> {
  const data = snap.data({ serverTimestamps: 'estimate' }) ?? {};
  return mapData(collection, snap.id, data, snap.metadata.hasPendingWrites);
}

/** Search tokens per entity type. Titles first so they survive the token cap. */
export function tokensFor(collection: CollectionName, r: Record<string, unknown>): string[] {
  const s = (k: string) => (typeof r[k] === 'string' ? (r[k] as string) : '');
  const tags = Array.isArray(r.tags) ? (r.tags as string[]) : [];
  switch (collection) {
    case 'notes':
      return buildSearchTokens(s('title'), tags, s('category'), s('content'));
    case 'tasks': {
      const subtasks = Array.isArray(r.subtasks) ? (r.subtasks as Subtask[]).map((x) => x.title) : [];
      return buildSearchTokens(s('title'), tags, s('category'), subtasks, s('description'));
    }
    case 'bookmarks':
      return buildSearchTokens(s('title'), hostnameOf(s('url')), tags, s('category'), s('description'), s('url'));
    case 'documents':
      return buildSearchTokens(s('title'), tags, s('category'), s('storageProvider'), s('fileType'), s('description'));
    case 'events':
      return buildSearchTokens(s('title'), s('kind'), s('description'));
  }
}
