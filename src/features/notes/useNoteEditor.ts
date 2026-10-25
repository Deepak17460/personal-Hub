import { useCallback, useEffect, useRef, useState } from 'react';
import type { Firestore } from 'firebase/firestore';
import { createNote, noteFieldsOf, saveNote } from '@/repositories/notes';
import { deleteRecord } from '@/repositories/records';
import { syncStore } from '@/lib/sync/syncStore';
import type { Note, NoteFields } from '@/types/models';
import { cancelDiscard, isBlankNote, isFresh, scheduleDiscard } from './freshNotes';

export const AUTOSAVE_DELAY_MS = 800;

export function sameFields(a: NoteFields | null, b: NoteFields | null): boolean {
  if (!a || !b) return a === b;
  return (
    a.title === b.title &&
    a.content === b.content &&
    a.category === b.category &&
    a.pinned === b.pinned &&
    a.archived === b.archived &&
    a.tags.length === b.tags.length &&
    a.tags.every((t, i) => t === b.tags[i])
  );
}

export type SaveState = 'saved' | 'unsaved' | 'conflict';

export interface NoteConflict {
  /** The local version that could not be saved / differs from the incoming version. */
  mine: NoteFields;
}

/**
 * Editor state machine for one note:
 * - autosaves the draft (debounced) as a new revision based on the last known revision;
 * - ignores echoes of its own writes;
 * - adopts remote changes when there are no local edits;
 * - raises a conflict when a remote change arrives while local edits exist, or when the
 *   server rejects a write because the note changed elsewhere (revision mismatch).
 */
export function useNoteEditor(db: Firestore, uid: string, note: Note | null | undefined) {
  const [draft, setDraftState] = useState<NoteFields | null>(null);
  const [conflict, setConflictState] = useState<NoteConflict | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('saved');

  const draftRef = useRef<NoteFields | null>(null);
  const baseRef = useRef<NoteFields | null>(null);
  const headRevRef = useRef<string | null>(null);
  const ownRevs = useRef(new Set<string>());
  const conflictRef = useRef<NoteConflict | null>(null);
  const latestNote = useRef<Note | null | undefined>(note);
  const mounted = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noteId = note?.id;

  latestNote.current = note;

  const setDraft = (fields: NoteFields) => {
    draftRef.current = fields;
    setDraftState(fields);
  };
  const setConflict = (c: NoteConflict | null) => {
    conflictRef.current = c;
    setConflictState(c);
    if (c) setSaveState('conflict');
  };

  const editingId = useRef<string | null>(null);

  const adopt = (n: Note) => {
    const fields = noteFieldsOf(n);
    editingId.current = n.id;
    baseRef.current = fields;
    headRevRef.current = n.revId;
    setDraft(fields);
    setSaveState('saved');
  };

  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const id = editingId.current;
    const fields = draftRef.current;
    if (!id || latestNote.current === null || !fields || conflictRef.current || !headRevRef.current) return;
    if (sameFields(fields, baseRef.current)) return;
    const result = saveNote(db, uid, id, headRevRef.current, fields, {
      onRejected: (attempted) => {
        if (!mounted.current) return false;
        setConflict({ mine: attempted });
        return true;
      },
    });
    ownRevs.current.add(result.revId);
    headRevRef.current = result.revId;
    baseRef.current = fields;
    setSaveState('saved');
  }, [db, uid]);

  // React to snapshots of the note.
  useEffect(() => {
    if (!note) return;
    if (draftRef.current === null || headRevRef.current === null) {
      adopt(note);
      return;
    }
    if (ownRevs.current.has(note.revId) || note.revId === headRevRef.current) return;
    if (conflictRef.current) return; // "theirs" is read from the latest note when resolving
    const remote = noteFieldsOf(note);
    if (sameFields(draftRef.current, remote)) {
      baseRef.current = remote;
      headRevRef.current = note.revId;
      return;
    }
    if (sameFields(draftRef.current, baseRef.current)) {
      adopt(note);
      return;
    }
    setConflict({ mine: draftRef.current });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note]);

  // Reset when switching to another note; a new note that was left blank is discarded.
  useEffect(() => {
    mounted.current = true;
    if (noteId) cancelDiscard(noteId);
    return () => {
      const id = editingId.current;
      const fields = draftRef.current;
      if (id && fields && isFresh(id) && isBlankNote(fields) && !conflictRef.current) {
        if (timer.current) clearTimeout(timer.current);
        timer.current = null;
        scheduleDiscard(id, () => deleteRecord(db, uid, 'notes', id));
      } else {
        flush();
      }
      mounted.current = false;
      editingId.current = null;
      draftRef.current = null;
      baseRef.current = null;
      headRevRef.current = null;
      conflictRef.current = null;
      ownRevs.current = new Set();
    };
  }, [noteId, flush, db, uid]);

  // Save when the tab is hidden or closed.
  useEffect(() => {
    const onHide = () => document.visibilityState === 'hidden' && flush();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flush);
    };
  }, [flush]);

  const update = useCallback(
    (patch: Partial<NoteFields>, immediate = false) => {
      if (!draftRef.current) return;
      setDraft({ ...draftRef.current, ...patch });
      if (conflictRef.current) return;
      setSaveState('unsaved');
      if (timer.current) clearTimeout(timer.current);
      if (immediate) flush();
      else timer.current = setTimeout(flush, AUTOSAVE_DELAY_MS);
    },
    [flush],
  );

  const resolve = useCallback(
    (choice: 'mine' | 'theirs' | 'both') => {
      const c = conflictRef.current;
      const theirs = latestNote.current;
      if (!c) return;
      setConflict(null);
      syncStore.clearError();
      if (choice === 'mine') {
        if (!theirs) return;
        headRevRef.current = theirs.revId;
        baseRef.current = noteFieldsOf(theirs);
        setDraft(c.mine);
        flush();
        return;
      }
      if (choice === 'both') {
        createNote(db, uid, { ...c.mine, title: `${c.mine.title || 'Untitled'} (my copy)`.slice(0, 200), pinned: false });
      }
      if (theirs) adopt(theirs);
    },
    // `adopt` only touches refs and state setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db, uid, flush],
  );

  return { draft, saveState, conflict, update, flush, resolve };
}
