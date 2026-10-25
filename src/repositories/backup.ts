import {
  Timestamp,
  documentId,
  getDocsFromServer,
  limit,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
  writeBatch,
  type DocumentData,
  type Firestore,
  type Query,
  type QueryDocumentSnapshot,
  type QuerySnapshot,
} from 'firebase/firestore';
import { BACKUP_FORMAT, BACKUP_VERSION, type BackupFile, type ExportedRecord } from '@/schemas/backup';
import type { ImportPlan } from '@/features/backup/importPlanner';
import { requireConnection, trackWrite } from '@/lib/sync/syncStore';
import { COLLECTIONS, type CollectionName, type Note, type Preferences, type RecordOf, type Task } from '@/types/models';
import { randomId } from '@/utils/ids';
import { mapSnapshot, tokensFor } from './mappers';
import { buildNoteCreateData, buildNoteUpdateData, noteFieldsOf } from './notes';
import { colRef, docRef, preferencesRef } from './paths';
import { buildCreateData, pickFields, validateFields, type SimpleCollection } from './records';

const PAGE = 500;

/**
 * Reads a whole collection from the Firestore server in pages of 500 (export/import only, never
 * on normal screens). Fails when offline instead of returning a partial in-memory copy.
 */
export async function fetchAll<C extends CollectionName>(db: Firestore, uid: string, c: C): Promise<RecordOf<C>[]> {
  requireConnection();
  const out: RecordOf<C>[] = [];
  let cursor: QueryDocumentSnapshot | null = null;
  for (;;) {
    const q: Query = cursor
      ? query(colRef(db, uid, c), orderBy(documentId()), startAfter(cursor), limit(PAGE))
      : query(colRef(db, uid, c), orderBy(documentId()), limit(PAGE));
    const snap: QuerySnapshot = await getDocsFromServer(q);
    snap.docs.forEach((d) => out.push(mapSnapshot(c, d)));
    if (snap.docs.length < PAGE) break;
    cursor = snap.docs[snap.docs.length - 1] ?? null;
  }
  return out;
}

function meta(r: { id: string; createdAt: Date; updatedAt: Date; schemaVersion: number }) {
  return {
    id: r.id,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    schemaVersion: r.schemaVersion,
  };
}

export function toExported<C extends CollectionName>(c: C, r: RecordOf<C>): ExportedRecord {
  if (c === 'notes') return { ...noteFieldsOf(r as Note), ...meta(r) };
  const fields = pickFields(c as SimpleCollection, r as unknown as Record<string, unknown>);
  if (c === 'tasks') {
    const t = r as Task;
    return { ...(fields as object), ...meta(r), completedAt: t.completedAt ? t.completedAt.toISOString() : null } as ExportedRecord;
  }
  return { ...(fields as object), ...meta(r) } as ExportedRecord;
}

export function buildBackup(data: { [C in CollectionName]: RecordOf<C>[] }, preferences: Preferences | undefined, appVersion: string): BackupFile {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    app: { name: 'Personal Hub', version: appVersion },
    data: {
      notes: data.notes.map((r) => toExported('notes', r)),
      tasks: data.tasks.map((r) => toExported('tasks', r)),
      bookmarks: data.bookmarks.map((r) => toExported('bookmarks', r)),
      documents: data.documents.map((r) => toExported('documents', r)),
      events: data.events.map((r) => toExported('events', r)),
    } as BackupFile['data'],
    ...(preferences ? { preferences } : {}),
  };
}

export async function exportAll(db: Firestore, uid: string, preferences: Preferences | undefined, appVersion: string): Promise<BackupFile> {
  const [notes, tasks, bookmarks, documents, events] = await Promise.all(COLLECTIONS.map((c) => fetchAll(db, uid, c)));
  return buildBackup(
    { notes, tasks, bookmarks, documents, events } as { [C in CollectionName]: RecordOf<C>[] },
    preferences,
    appVersion,
  );
}

const META_KEYS = ['id', 'createdAt', 'updatedAt', 'schemaVersion', 'completedAt'];

function stripMeta(record: ExportedRecord): Record<string, unknown> {
  const fields: Record<string, unknown> = { ...record };
  for (const key of META_KEYS) delete fields[key];
  return fields;
}

function completedAtOf(record: ExportedRecord): Timestamp | null {
  const value = (record as { completedAt?: string | null }).completedAt;
  return value ? Timestamp.fromMillis(Math.min(Date.parse(value), Date.now())) : null;
}

export function buildImportWrite(op: ImportPlan['ops'][number]): DocumentData {
  const { collection: c, record } = op;
  const fields = stripMeta(record);
  const dates = { createdAt: new Date(record.createdAt), updatedAt: new Date(record.updatedAt) };

  if (op.kind === 'create') {
    if (c === 'notes') return buildNoteCreateData(record.id, fields as never, randomId(), dates);
    const data = buildCreateData(c, record.id, fields as never, dates);
    if (c === 'tasks') data.completedAt = completedAtOf(record);
    return data;
  }

  if (c === 'notes') {
    const current = op.existing as unknown as Note;
    return buildNoteUpdateData(fields as never, current.revId, randomId());
  }
  const valid = validateFields(c, fields as never) as unknown as Record<string, unknown>;
  const data: DocumentData = {
    ...valid,
    schemaVersion: record.schemaVersion,
    searchTokens: tokensFor(c, valid),
    updatedAt: serverTimestamp(),
  };
  if (c === 'tasks') data.completedAt = completedAtOf(record);
  return data;
}

/** Applies an import plan with batched writes (max 500 operations per batch). Requires a connection. */
export async function applyImport(
  db: Firestore,
  uid: string,
  plan: ImportPlan,
  preferences?: Preferences,
  onProgress?: (done: number, total: number) => void,
): Promise<number> {
  const CHUNK = 400;
  let done = 0;
  for (let i = 0; i < plan.ops.length; i += CHUNK) {
    const batch = writeBatch(db);
    for (const op of plan.ops.slice(i, i + CHUNK)) {
      const ref = docRef(db, uid, op.collection, op.record.id);
      const data = buildImportWrite(op);
      if (op.kind === 'create') batch.set(ref, data);
      else batch.set(ref, data, { merge: true });
    }
    await trackWrite(() => batch.commit());
    done = Math.min(plan.ops.length, i + CHUNK);
    onProgress?.(done, plan.ops.length);
  }
  if (preferences) {
    const batch = writeBatch(db);
    batch.set(preferencesRef(db, uid), { ...preferences, updatedAt: serverTimestamp() });
    await trackWrite(() => batch.commit());
  }
  return done;
}
