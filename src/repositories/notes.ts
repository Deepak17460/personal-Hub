import { serverTimestamp, setDoc, type DocumentData, type Firestore } from 'firebase/firestore';
import { noteFieldsSchema } from '@/schemas/entities';
import { dedupeTags } from '@/schemas/common';
import { errorCode } from '@/lib/firebase/errors';
import { syncStore, trackWrite } from '@/lib/sync/syncStore';
import type { Note, NoteFields } from '@/types/models';
import { randomId } from '@/utils/ids';
import { SCHEMA_VERSION, tokensFor } from './mappers';
import { docRef, newDocId } from './paths';
import { timestampOrServer, type CreateOptions, type WriteResult } from './records';

/**
 * Conflict strategy for notes (documented in docs/ARCHITECTURE.md):
 * every write carries a new random `revId` and the `prevRevId` it was based on. Firestore rules
 * only accept an update whose prevRevId equals the stored revId. A device that edited an
 * outdated copy (e.g. offline) is therefore rejected instead of silently overwriting newer text.
 * The rejected content is handed to the open editor, or saved as a "conflict copy" note.
 */
export interface NoteWriteResult extends WriteResult {
  revId: string;
}

export const EMPTY_NOTE: NoteFields = {
  title: '',
  content: '',
  category: '',
  tags: [],
  pinned: false,
  archived: false,
};

export function noteFieldsOf(note: NoteFields): NoteFields {
  return {
    title: note.title,
    content: note.content,
    category: note.category,
    tags: note.tags,
    pinned: note.pinned,
    archived: note.archived,
  };
}

function prepare(fields: NoteFields): NoteFields {
  return noteFieldsSchema.parse({ ...fields, tags: dedupeTags(fields.tags) });
}

export function buildNoteCreateData(id: string, fields: NoteFields, revId: string, opts: CreateOptions = {}): DocumentData {
  const valid = prepare(fields);
  return {
    ...valid,
    id,
    schemaVersion: SCHEMA_VERSION.notes,
    searchTokens: tokensFor('notes', valid as unknown as Record<string, unknown>),
    revId,
    prevRevId: null,
    createdAt: timestampOrServer(opts.createdAt),
    updatedAt: timestampOrServer(opts.updatedAt),
  };
}

export function createNote(db: Firestore, uid: string, fields: NoteFields, opts: CreateOptions = {}): NoteWriteResult {
  const id = opts.id ?? newDocId(db, uid, 'notes');
  const revId = randomId();
  const data = buildNoteCreateData(id, fields, revId, opts);
  return { id, revId, done: trackWrite(setDoc(docRef(db, uid, 'notes', id), data)) };
}

export function buildNoteUpdateData(fields: NoteFields, prevRevId: string, revId: string): DocumentData {
  const valid = prepare(fields);
  return {
    ...valid,
    searchTokens: tokensFor('notes', valid as unknown as Record<string, unknown>),
    revId,
    prevRevId,
    updatedAt: serverTimestamp(),
  };
}

export interface SaveNoteOptions {
  /** Return true if the caller (an open editor) handled the rejection itself. */
  onRejected?: (attempted: NoteFields, error: unknown) => boolean;
}

const conflictCopies = new Map<string, { id: string; revId: string }>();

/** Full-content update based on `prevRevId` (the revision this edit was derived from). */
export function saveNote(
  db: Firestore,
  uid: string,
  id: string,
  prevRevId: string,
  fields: NoteFields,
  opts: SaveNoteOptions = {},
): NoteWriteResult {
  const revId = randomId();
  const data = buildNoteUpdateData(fields, prevRevId, revId);
  const write = setDoc(docRef(db, uid, 'notes', id), data, { merge: true });
  const done = trackWrite(write, { silent: true }).catch((error: unknown) => {
    if (errorCode(error) !== 'permission-denied') {
      syncStore.emit({ type: 'error', message: 'A note change could not be saved.' });
      throw error;
    }
    if (opts.onRejected?.(fields, error)) return;
    saveConflictCopy(db, uid, id, fields);
  });
  return { id, revId, done };
}

/** Keeps rejected edits as a separate note so nothing typed is ever lost. */
export function saveConflictCopy(db: Firestore, uid: string, sourceId: string, fields: NoteFields): string {
  const stamp = new Date().toLocaleString();
  const copyFields: NoteFields = {
    ...fields,
    title: `${fields.title || 'Untitled'} (conflict copy ${stamp})`.slice(0, 200),
    pinned: false,
  };
  const existing = conflictCopies.get(sourceId);
  let result: NoteWriteResult;
  if (existing) {
    result = saveNote(db, uid, existing.id, existing.revId, copyFields);
  } else {
    result = createNote(db, uid, copyFields);
  }
  conflictCopies.set(sourceId, { id: result.id, revId: result.revId });
  syncStore.emit({
    type: 'conflict',
    message: 'A note was changed on another device. Your version was saved as a conflict copy.',
  });
  return result.id;
}

/** Small metadata changes (pin/archive) from list views. */
export function patchNote(db: Firestore, uid: string, note: Note, patch: Partial<NoteFields>): NoteWriteResult {
  return saveNote(db, uid, note.id, note.revId, { ...noteFieldsOf(note), ...patch });
}
