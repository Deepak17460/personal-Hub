import {
  Timestamp,
  deleteDoc,
  serverTimestamp,
  setDoc,
  type DocumentData,
  type FieldValue,
  type Firestore,
} from 'firebase/firestore';
import type { z } from 'zod';
import {
  bookmarkFieldsSchema,
  documentFieldsSchema,
  eventFieldsSchema,
  taskFieldsSchema,
} from '@/schemas/entities';
import { trackWrite } from '@/lib/sync/syncStore';
import type { BookmarkFields, CollectionName, DocumentFields, EventFields, TaskFields } from '@/types/models';
import { SCHEMA_VERSION, tokensFor } from './mappers';
import { docRef, newDocId } from './paths';

export type SimpleCollection = Exclude<CollectionName, 'notes'>;

export interface FieldsOf {
  tasks: TaskFields;
  bookmarks: BookmarkFields;
  documents: DocumentFields;
  events: EventFields;
}

const FIELD_SCHEMAS: { [C in SimpleCollection]: z.ZodType<FieldsOf[C]> } = {
  tasks: taskFieldsSchema as z.ZodType<TaskFields>,
  bookmarks: bookmarkFieldsSchema,
  documents: documentFieldsSchema,
  events: eventFieldsSchema,
};

export interface WriteResult {
  id: string;
  /** Resolves when the server acknowledges the write (may be much later while offline). */
  done: Promise<void>;
}

export interface CreateOptions {
  id?: string;
  /** Preserve original timestamps (used by import). Defaults to server time. */
  createdAt?: Date;
  updatedAt?: Date;
}

export function timestampOrServer(date: Date | undefined): Timestamp | FieldValue {
  if (!date) return serverTimestamp();
  return Timestamp.fromMillis(Math.min(date.getTime(), Date.now()));
}

export function validateFields<C extends SimpleCollection>(collection: C, fields: FieldsOf[C]): FieldsOf[C] {
  return FIELD_SCHEMAS[collection].parse(fields);
}

export function buildCreateData<C extends SimpleCollection>(
  collection: C,
  id: string,
  fields: FieldsOf[C],
  opts: CreateOptions = {},
): DocumentData {
  const valid = validateFields(collection, fields);
  const data: DocumentData = {
    ...valid,
    id,
    schemaVersion: SCHEMA_VERSION[collection],
    searchTokens: tokensFor(collection, valid as unknown as Record<string, unknown>),
    createdAt: timestampOrServer(opts.createdAt),
    updatedAt: timestampOrServer(opts.updatedAt),
  };
  if (collection === 'tasks') {
    data.completedAt = (valid as TaskFields).status === 'done' ? serverTimestamp() : null;
  }
  return data;
}

export function createRecord<C extends SimpleCollection>(
  db: Firestore,
  uid: string,
  collection: C,
  fields: FieldsOf[C],
  opts: CreateOptions = {},
): WriteResult {
  const id = opts.id ?? newDocId(db, uid, collection);
  const data = buildCreateData(collection, id, fields, opts);
  return { id, done: trackWrite(() => setDoc(docRef(db, uid, collection, id), data)) };
}

/**
 * Last-writer-wins update. `current` is the full current record so search tokens can be
 * recomputed; only changed fields plus metadata are sent (merge), keeping createdAt intact.
 */
export function updateRecord<C extends SimpleCollection>(
  db: Firestore,
  uid: string,
  collection: C,
  current: FieldsOf[C] & { id: string },
  patch: Partial<FieldsOf[C]>,
  extra: DocumentData = {},
): WriteResult {
  const { id, ...rest } = current as FieldsOf[C] & { id: string } & Record<string, unknown>;
  const merged = { ...pickFields(collection, rest as Record<string, unknown>), ...patch } as FieldsOf[C];
  const valid = validateFields(collection, merged) as unknown as Record<string, unknown>;
  const patchData: DocumentData = {};
  for (const key of Object.keys(patch)) patchData[key] = valid[key];
  const data: DocumentData = {
    ...patchData,
    ...extra,
    searchTokens: tokensFor(collection, valid),
    updatedAt: serverTimestamp(),
  };
  return { id, done: trackWrite(() => setDoc(docRef(db, uid, collection, id), data, { merge: true })) };
}

export function deleteRecord(db: Firestore, uid: string, collection: CollectionName, id: string): WriteResult {
  return { id, done: trackWrite(() => deleteDoc(docRef(db, uid, collection, id))) };
}

const FIELD_KEYS: { [C in SimpleCollection]: (keyof FieldsOf[C])[] } = {
  tasks: ['title', 'description', 'priority', 'status', 'dueDate', 'category', 'tags', 'subtasks', 'recurrence'],
  bookmarks: ['url', 'title', 'description', 'category', 'tags', 'favorite'],
  documents: ['title', 'description', 'category', 'tags', 'externalUrl', 'storageProvider', 'fileType', 'fileSizeBytes'],
  events: ['title', 'description', 'date', 'time', 'kind', 'recurrence', 'reminderMinutes'],
};

export function pickFields<C extends SimpleCollection>(collection: C, record: Record<string, unknown>): FieldsOf[C] {
  const out: Record<string, unknown> = {};
  for (const key of FIELD_KEYS[collection]) out[key as string] = record[key as string];
  return out as unknown as FieldsOf[C];
}
