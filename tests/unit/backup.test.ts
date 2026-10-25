import { describe, expect, it } from 'vitest';
import { buildBackup } from '@/repositories/backup';
import { parseBackup, BACKUP_FORMAT } from '@/schemas/backup';
import { planImport, type ExistingRecord } from '@/features/backup/importPlanner';
import { DEFAULT_PREFERENCES } from '@/repositories/preferences';
import type { Bookmark, CollectionName, Note, Task } from '@/types/models';

const t0 = new Date('2024-01-01T10:00:00Z');
const t1 = new Date('2024-02-01T10:00:00Z');

const note: Note = {
  id: 'note1',
  createdAt: t0,
  updatedAt: t0,
  schemaVersion: 1,
  title: 'Groceries',
  content: '- milk',
  category: 'Home',
  tags: ['list'],
  pinned: true,
  archived: false,
  revId: 'r1',
  prevRevId: null,
  searchTokens: ['gr'],
};
const task: Task = {
  id: 'task1',
  createdAt: t0,
  updatedAt: t0,
  schemaVersion: 1,
  title: 'Pay rent',
  description: '',
  priority: 'high',
  status: 'done',
  dueDate: '2024-01-05',
  category: '',
  tags: [],
  subtasks: [{ id: 's1', title: 'Transfer', done: true }],
  recurrence: { freq: 'monthly', interval: 1 },
  completedAt: t1,
};
const bookmark: Bookmark = {
  id: 'bm1',
  createdAt: t0,
  updatedAt: t0,
  schemaVersion: 1,
  url: 'https://example.com/',
  title: 'Example',
  description: '',
  category: '',
  tags: [],
  favorite: false,
};

function makeBackup() {
  return buildBackup({ notes: [note], tasks: [task], bookmarks: [bookmark], documents: [], events: [] }, DEFAULT_PREFERENCES, '1.0.0');
}

const emptyExisting = (): Record<CollectionName, ExistingRecord[]> => ({ notes: [], tasks: [], bookmarks: [], documents: [], events: [] });

describe('export format', () => {
  it('produces a versioned file without internal fields or secrets', () => {
    const backup = makeBackup();
    expect(backup.format).toBe(BACKUP_FORMAT);
    expect(backup.version).toBe(1);
    const json = JSON.stringify(backup);
    expect(json).not.toContain('searchTokens');
    expect(json).not.toContain('revId');
    expect(json).not.toMatch(/token|password|apiKey/i);
    expect(backup.data.tasks[0]).toMatchObject({ completedAt: t1.toISOString(), createdAt: t0.toISOString() });
  });

  it('round-trips through JSON and validation', () => {
    const parsed = parseBackup(JSON.stringify(makeBackup()));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.backup.data.notes[0]?.title).toBe('Groceries');
      expect(parsed.backup.preferences?.theme).toBe('system');
    }
  });
});

describe('import validation', () => {
  it('rejects invalid JSON and foreign files', () => {
    expect(parseBackup('{oops').ok).toBe(false);
    expect(parseBackup(JSON.stringify({ hello: 'world' })).ok).toBe(false);
  });

  it('rejects newer format versions', () => {
    const r = parseBackup(JSON.stringify({ ...makeBackup(), version: 99 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/newer/);
  });

  it('rejects unsafe URLs and bad ids inside records', () => {
    const backup = makeBackup();
    backup.data.bookmarks[0] = { ...backup.data.bookmarks[0]!, url: 'javascript:alert(1)' } as never;
    expect(parseBackup(JSON.stringify(backup)).ok).toBe(false);
    const b2 = makeBackup();
    b2.data.notes[0] = { ...b2.data.notes[0]!, id: '../../etc' } as never;
    expect(parseBackup(JSON.stringify(b2)).ok).toBe(false);
  });

  it('strips unknown fields', () => {
    const raw = JSON.parse(JSON.stringify(makeBackup()));
    raw.data.notes[0].isAdmin = true;
    raw.data.notes[0].__proto_hack = 'x';
    const r = parseBackup(JSON.stringify(raw));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.backup.data.notes[0]).not.toHaveProperty('isAdmin');
  });
});

describe('import planning (duplicates & conflicts)', () => {
  const backup = () => {
    const r = parseBackup(JSON.stringify(makeBackup()));
    if (!r.ok) throw new Error('fixture invalid');
    return r.backup;
  };

  it('creates everything into an empty workspace', () => {
    const plan = planImport(backup(), emptyExisting(), 'skip');
    expect(plan.ops).toHaveLength(3);
    expect(plan.summary.notes.create).toBe(1);
  });

  it('skips same-ID records by default and replaces only newer ones with "newer"', () => {
    const existing = emptyExisting();
    existing.notes = [{ id: 'note1', updatedAt: new Date('2023-12-01T00:00:00Z'), title: 'old', content: '' }];
    existing.tasks = [{ id: 'task1', updatedAt: new Date('2025-01-01T00:00:00Z'), title: 'newer locally' }];

    const skip = planImport(backup(), existing, 'skip');
    expect(skip.summary.notes.skippedSameId).toBe(1);
    expect(skip.summary.tasks.skippedSameId).toBe(1);

    const newer = planImport(backup(), existing, 'newer');
    expect(newer.summary.notes.replace).toBe(1);
    expect(newer.summary.tasks.replace).toBe(0);
    expect(newer.summary.tasks.skippedSameId).toBe(1);

    const overwrite = planImport(backup(), existing, 'overwrite');
    expect(overwrite.summary.tasks.replace).toBe(1);
  });

  it('detects content duplicates under different IDs (same bookmark URL)', () => {
    const existing = emptyExisting();
    existing.bookmarks = [{ id: 'other', updatedAt: t0, url: 'http://www.example.com' }];
    const plan = planImport(backup(), existing, 'skip');
    expect(plan.summary.bookmarks.skippedDuplicate).toBe(1);
    expect(plan.ops.some((o) => o.collection === 'bookmarks')).toBe(false);
  });

  it('keeps both with new IDs in "duplicate" mode', () => {
    const existing = emptyExisting();
    existing.notes = [{ id: 'note1', updatedAt: t0, title: 'Groceries', content: '- milk' }];
    let n = 0;
    const plan = planImport(backup(), existing, 'duplicate', () => `new${++n}`);
    const op = plan.ops.find((o) => o.collection === 'notes');
    expect(op?.kind).toBe('create');
    expect(op?.record.id).toBe('new1');
  });

  it('is idempotent: importing the same file twice creates nothing the second time', () => {
    const first = planImport(backup(), emptyExisting(), 'skip');
    const existing = emptyExisting();
    for (const op of first.ops) existing[op.collection].push({ ...(op.record as object), id: op.record.id, updatedAt: new Date(op.record.updatedAt) });
    const second = planImport(backup(), existing, 'skip');
    expect(second.ops).toHaveLength(0);
  });
});
