import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { getDoc, getDocs, type Firestore } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { planImport } from '@/features/backup/importPlanner';
import { applyImport, exportAll, fetchAll } from '@/repositories/backup';
import { mapSnapshot } from '@/repositories/mappers';
import { createNote, EMPTY_NOTE, patchNote, saveNote } from '@/repositories/notes';
import { colRef, docRef } from '@/repositories/paths';
import { DEFAULT_PREFERENCES, loadPreferences } from '@/repositories/preferences';
import { fetchTaskCounts, searchCollection } from '@/repositories/queries';
import { createRecord, deleteRecord, updateRecord } from '@/repositories/records';
import { EMPTY_TASK, setTaskStatus } from '@/repositories/tasks';
import { parseBackup } from '@/schemas/backup';
import { syncStore } from '@/lib/sync/syncStore';
import { COLLECTIONS, type CollectionName, type Note, type Task } from '@/types/models';
import { GOOGLE_TOKEN, OWNER, STRANGER, ownerDb, setupEnv } from './helpers';

let env: RulesTestEnvironment;
let db: Firestore;

beforeAll(async () => {
  env = await setupEnv('demo-repo-test');
});
afterAll(async () => {
  await env?.cleanup();
});
beforeEach(async () => {
  await env.clearFirestore();
  db = ownerDb(env);
});

async function readNote(id: string): Promise<Note> {
  return mapSnapshot('notes', await getDoc(docRef(db, OWNER, 'notes', id)));
}

describe('notes CRUD through repositories', () => {
  it('creates, edits and deletes a note', async () => {
    const created = createNote(db, OWNER, { ...EMPTY_NOTE, title: 'Shopping', content: 'milk', tags: ['home', 'Home'] });
    await created.done;
    let note = await readNote(created.id);
    expect(note.title).toBe('Shopping');
    expect(note.tags).toEqual(['home']);
    expect(note.createdAt).toBeInstanceOf(Date);

    const edit = saveNote(db, OWNER, note.id, note.revId, { ...note, content: 'milk, eggs' });
    await edit.done;
    note = await readNote(created.id);
    expect(note.content).toBe('milk, eggs');
    expect(note.revId).toBe(edit.revId);

    await patchNote(db, OWNER, note, { pinned: true }).done;
    expect((await readNote(created.id)).pinned).toBe(true);

    await deleteRecord(db, OWNER, 'notes', created.id).done;
    expect((await getDoc(docRef(db, OWNER, 'notes', created.id))).exists()).toBe(false);
  });

  it('saves a stale edit (e.g. from an offline device) as a conflict copy instead of overwriting', async () => {
    const events: string[] = [];
    const off = syncStore.onEvent((e) => events.push(e.type));
    const created = createNote(db, OWNER, { ...EMPTY_NOTE, title: 'Plan', content: 'v1' });
    await created.done;
    const base = await readNote(created.id);

    await saveNote(db, OWNER, base.id, base.revId, { ...base, content: 'laptop edit' }).done;
    // Phone edited the same base revision while offline:
    await saveNote(db, OWNER, base.id, base.revId, { ...base, content: 'phone edit' }).done;

    expect((await readNote(created.id)).content).toBe('laptop edit');
    await new Promise((r) => setTimeout(r, 300));
    const all = await fetchAll(db, OWNER, 'notes');
    const copy = all.find((n) => n.id !== created.id);
    expect(copy?.content).toBe('phone edit');
    expect(copy?.title).toMatch(/conflict copy/);
    expect(events).toContain('conflict');
    off();
  });

  it('lets the open editor handle a rejection itself', async () => {
    const created = createNote(db, OWNER, { ...EMPTY_NOTE, title: 'X' });
    await created.done;
    const base = await readNote(created.id);
    await saveNote(db, OWNER, base.id, base.revId, { ...base, content: 'A' }).done;
    let handled: string | null = null;
    await saveNote(db, OWNER, base.id, base.revId, { ...base, content: 'B' }, { onRejected: (f) => ((handled = f.content), true) }).done;
    expect(handled).toBe('B');
    expect(await fetchAll(db, OWNER, 'notes')).toHaveLength(1);
  });
});

describe('tasks, bookmarks, documents and events', () => {
  it('runs CRUD for each simple collection', async () => {
    const t = createRecord(db, OWNER, 'tasks', { ...EMPTY_TASK, title: 'Pay bills', dueDate: '2024-01-01' });
    const b = createRecord(db, OWNER, 'bookmarks', { url: 'https://example.com', title: 'Ex', description: '', category: '', tags: [], favorite: false });
    const d = createRecord(db, OWNER, 'documents', {
      title: 'Passport',
      description: '',
      category: 'ID',
      tags: [],
      externalUrl: 'https://drive.google.com/x',
      storageProvider: 'Google Drive',
      fileType: 'PDF',
      fileSizeBytes: 2_000_000,
    });
    const e = createRecord(db, OWNER, 'events', {
      title: 'Birthday',
      description: '',
      date: '2024-06-15',
      time: null,
      kind: 'important',
      recurrence: { freq: 'yearly', interval: 1 },
      reminderMinutes: 1440,
    });
    await Promise.all([t.done, b.done, d.done, e.done]);

    const task = mapSnapshot('tasks', await getDoc(docRef(db, OWNER, 'tasks', t.id)));
    await updateRecord(db, OWNER, 'tasks', task, { priority: 'critical', title: '  Pay all bills ' }).done;
    const updated = mapSnapshot('tasks', await getDoc(docRef(db, OWNER, 'tasks', t.id)));
    expect(updated.priority).toBe('critical');
    expect(updated.title).toBe('Pay all bills');
    expect(updated.searchTokens).toContain('all');
    expect(updated.createdAt.getTime()).toBe(task.createdAt.getTime());

    await deleteRecord(db, OWNER, 'bookmarks', b.id).done;
    expect((await getDocs(colRef(db, OWNER, 'bookmarks'))).size).toBe(0);
  });

  it('completing a recurring task creates the next one atomically', async () => {
    const t = createRecord(db, OWNER, 'tasks', { ...EMPTY_TASK, title: 'Water plants', dueDate: '2024-03-10', recurrence: { freq: 'weekly', interval: 1 } });
    await t.done;
    const task = mapSnapshot('tasks', await getDoc(docRef(db, OWNER, 'tasks', t.id)));
    await setTaskStatus(db, OWNER, task, 'done').done;
    const all = (await fetchAll(db, OWNER, 'tasks')) as Task[];
    expect(all).toHaveLength(2);
    const done = all.find((x) => x.id === t.id)!;
    const next = all.find((x) => x.id !== t.id)!;
    expect(done.status).toBe('done');
    expect(done.completedAt).toBeInstanceOf(Date);
    expect(done.recurrence.freq).toBe('none');
    expect(next).toMatchObject({ status: 'todo', dueDate: '2024-03-17' });
  });

  it('counts tasks and searches via the token index', async () => {
    await Promise.all([
      createRecord(db, OWNER, 'tasks', { ...EMPTY_TASK, title: 'Renew passport', dueDate: '2000-01-01' }).done,
      createRecord(db, OWNER, 'tasks', { ...EMPTY_TASK, title: 'Book flights', status: 'done' }).done,
      createRecord(db, OWNER, 'tasks', { ...EMPTY_TASK, title: 'Pack bags' }).done,
    ]);
    expect(await fetchTaskCounts(db, OWNER, '2024-01-01')).toEqual({ open: 2, done: 1, overdue: 1 });
    const hits = await searchCollection(db, OWNER, 'tasks', 'pass ren');
    expect(hits.map((h) => h.title)).toEqual(['Renew passport']);
    expect(await searchCollection(db, OWNER, 'tasks', 'zzz')).toHaveLength(0);
  });
});

describe('preferences authorisation probe', () => {
  it('creates defaults for the owner and is denied for others', async () => {
    expect(await loadPreferences(db, OWNER)).toEqual(DEFAULT_PREFERENCES);
    const stranger = env.authenticatedContext(STRANGER, GOOGLE_TOKEN).firestore() as unknown as Firestore;
    await expect(loadPreferences(stranger, STRANGER)).rejects.toMatchObject({ code: 'permission-denied' });
  });
});

describe('export and restore', () => {
  it('exports everything, restores into an empty workspace and skips duplicates on re-import', async () => {
    const n = createNote(db, OWNER, { ...EMPTY_NOTE, title: 'Diary', content: 'Day 1', tags: ['life'] });
    await Promise.all([
      n.done,
      createRecord(db, OWNER, 'tasks', { ...EMPTY_TASK, title: 'Done thing', status: 'done' }).done,
      createRecord(db, OWNER, 'bookmarks', { url: 'https://example.com', title: 'Ex', description: '', category: 'Ref', tags: [], favorite: true }).done,
    ]);
    const backup = await exportAll(db, OWNER, DEFAULT_PREFERENCES, 'test');
    const text = JSON.stringify(backup);
    expect(text).not.toMatch(/searchTokens|revId/);

    await env.clearFirestore();
    db = ownerDb(env);
    const parsed = parseBackup(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const empty = Object.fromEntries(COLLECTIONS.map((c) => [c, []])) as unknown as Record<CollectionName, never[]>;
    const plan = planImport(parsed.backup, empty, 'skip');
    expect(await applyImport(db, OWNER, plan, parsed.backup.preferences)).toBe(3);

    const notes = await fetchAll(db, OWNER, 'notes');
    expect(notes[0]).toMatchObject({ id: n.id, title: 'Diary', tags: ['life'] });
    expect(notes[0]!.createdAt.toISOString()).toBe(backup.data.notes[0]!.createdAt);
    expect(notes[0]!.searchTokens).toContain('diary');
    const tasks = (await fetchAll(db, OWNER, 'tasks')) as Task[];
    expect(tasks[0]!.completedAt).toBeInstanceOf(Date);

    // Re-importing the same file creates nothing.
    const existing = Object.fromEntries(await Promise.all(COLLECTIONS.map(async (c) => [c, await fetchAll(db, OWNER, c)]))) as never;
    expect(planImport(parsed.backup, existing, 'skip').ops).toHaveLength(0);

    // Overwrite mode replaces an edited note, respecting the revision rule.
    const current = notes[0]!;
    await saveNote(db, OWNER, current.id, current.revId, { ...current, content: 'changed' }).done;
    const existing2 = Object.fromEntries(await Promise.all(COLLECTIONS.map(async (c) => [c, await fetchAll(db, OWNER, c)]))) as never;
    const overwrite = planImport(parsed.backup, existing2, 'overwrite');
    await applyImport(db, OWNER, overwrite);
    expect((await readNote(current.id)).content).toBe('Day 1');
  });
});
