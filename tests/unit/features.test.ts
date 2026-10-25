import { describe, expect, it, vi } from 'vitest';
import { cancelDiscard, isBlankNote, isFresh, markFresh, scheduleDiscard } from '@/features/notes/freshNotes';
import { EMPTY_NOTE } from '@/repositories/notes';
import { dedupeBookmarks, escapeHtml, parseBookmarkHtml, toBookmarkHtml } from '@/features/bookmarks/bookmarkIO';
import { dueReminders, occurrencesInRange, reminderTime } from '@/features/calendar/occurrences';
import { sameFields } from '@/features/notes/useNoteEditor';
import { filterNotes } from '@/features/notes/NotesPage';
import { filterTasks, sortTasks } from '@/features/tasks/TasksPage';
import { EMPTY_TASK, isOverdue, nextRecurringTask } from '@/repositories/tasks';
import { deriveStatus, syncStore, trackWrite } from '@/lib/sync/syncStore';
import type { Bookmark, CalendarEvent, Note, Task } from '@/types/models';

const now = new Date('2024-03-10T08:00:00');

function task(p: Partial<Task>): Task {
  return { ...EMPTY_TASK, id: Math.random().toString(36).slice(2), createdAt: now, updatedAt: now, schemaVersion: 1, completedAt: null, title: 't', ...p };
}
function event(p: Partial<CalendarEvent>): CalendarEvent {
  return {
    id: 'e1',
    createdAt: now,
    updatedAt: now,
    schemaVersion: 1,
    title: 'Event',
    description: '',
    date: '2024-03-10',
    time: '09:00',
    kind: 'event',
    recurrence: { freq: 'none', interval: 1 },
    reminderMinutes: 30,
    ...p,
  };
}

describe('bookmark import/export', () => {
  it('parses browser bookmark HTML with folders and drops unsafe links', () => {
    const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><p>
      <DT><H3>Dev</H3><DL><p>
        <DT><A HREF="https://developer.mozilla.org" TAGS="docs,web">MDN</A>
        <DT><A HREF="javascript:alert(1)">Evil</A>
        <DT><A HREF="data:text/html,x">Data</A>
      </DL><p>
      <DT><A HREF="http://example.com">Example</A>
    </DL>`;
    const items = parseBookmarkHtml(html);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ url: 'https://developer.mozilla.org', title: 'MDN', category: 'Dev', tags: ['docs', 'web'] });
  });

  it('escapes titles on export so the file cannot inject markup', () => {
    const b: Bookmark = { id: '1', createdAt: now, updatedAt: now, schemaVersion: 1, url: 'https://x.dev/?a=1&b=2', title: '<img src=x onerror=alert(1)>', description: '', category: '', tags: [], favorite: false };
    const html = toBookmarkHtml([b]);
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
    expect(html).toContain('a=1&amp;b=2');
    expect(escapeHtml(`"'`)).toBe('&quot;&#39;');
  });

  it('dedupes against existing and within the file', () => {
    const incoming = parseBookmarkHtml('<a href="https://a.dev/">A</a><a href="https://www.a.dev">A2</a><a href="https://b.dev">B</a>');
    const { fresh, duplicates } = dedupeBookmarks(incoming, [{ url: 'https://b.dev/' }]);
    expect(fresh.map((f) => f.url)).toEqual(['https://a.dev/']);
    expect(duplicates).toBe(2);
  });
});

describe('calendar occurrences & reminders', () => {
  it('merges lists, dedupes by id and expands recurring events', () => {
    const weekly = event({ id: 'w', date: '2024-02-26', recurrence: { freq: 'weekly', interval: 1 } });
    const occ = occurrencesInRange([[weekly], [weekly, event({ id: 'x', date: '2024-03-05' })]], '2024-03-01', '2024-03-15');
    expect(occ.filter((o) => o.event.id === 'w').map((o) => o.date)).toEqual(['2024-03-04', '2024-03-11']);
    expect(occ.find((o) => o.event.id === 'x')?.date).toBe('2024-03-05');
  });

  it('computes reminder time (all-day uses 09:00) and fires each once', () => {
    const allDay = occurrencesInRange([[event({ time: null, reminderMinutes: 60 })]], '2024-03-10', '2024-03-10')[0]!;
    expect(reminderTime(allDay)?.getHours()).toBe(8);
    const occ = occurrencesInRange([[event({})]], '2024-03-10', '2024-03-10');
    expect(dueReminders(occ, new Date('2024-03-10T08:29:00'), new Set())).toHaveLength(0);
    expect(dueReminders(occ, new Date('2024-03-10T08:31:00'), new Set())).toHaveLength(1);
    expect(dueReminders(occ, new Date('2024-03-10T08:31:00'), new Set([occ[0]!.key]))).toHaveLength(0);
  });
});

describe('tasks', () => {
  it('creates the next instance of a recurring task with reset subtasks', () => {
    const next = nextRecurringTask(
      { ...EMPTY_TASK, title: 'Water plants', dueDate: '2024-03-10', recurrence: { freq: 'weekly', interval: 1 }, status: 'done', subtasks: [{ id: 'a', title: 'x', done: true }] },
      '2024-03-10',
    );
    expect(next).toMatchObject({ dueDate: '2024-03-17', status: 'todo' });
    expect(next?.subtasks[0]?.done).toBe(false);
    expect(nextRecurringTask({ ...EMPTY_TASK, title: 'once' })).toBeNull();
  });

  it('filters by view and sorts by due date then priority', () => {
    const today = '2024-03-10';
    const rows = [
      task({ title: 'overdue', dueDate: '2024-03-01' }),
      task({ title: 'today-low', dueDate: today, priority: 'low' }),
      task({ title: 'today-crit', dueDate: today, priority: 'critical' }),
      task({ title: 'later', dueDate: '2024-04-01' }),
      task({ title: 'nodate' }),
      task({ title: 'done', status: 'done', dueDate: '2024-03-01' }),
    ];
    expect(filterTasks(rows, 'overdue', today).map((t) => t.title)).toEqual(['overdue']);
    expect(filterTasks(rows, 'today', today)).toHaveLength(3);
    expect(filterTasks(rows, 'done', today)).toHaveLength(1);
    expect(sortTasks(filterTasks(rows, 'open', today), 'due').map((t) => t.title)).toEqual(['overdue', 'today-crit', 'today-low', 'later', 'nodate']);
    expect(isOverdue({ status: 'done', dueDate: '2000-01-01' }, today)).toBe(false);
  });
});

describe('notes', () => {
  const n = (p: Partial<Note>): Note => ({
    id: Math.random().toString(36),
    createdAt: now,
    updatedAt: now,
    schemaVersion: 1,
    title: '',
    content: '',
    category: '',
    tags: [],
    pinned: false,
    archived: false,
    revId: 'r',
    prevRevId: null,
    ...p,
  });

  it('filters archived/pinned and sorts pinned first', () => {
    const rows = [n({ title: 'a' }), n({ title: 'b', pinned: true }), n({ title: 'c', archived: true })];
    expect(filterNotes(rows, 'all').map((x) => x.title)).toEqual(['b', 'a']);
    expect(filterNotes(rows, 'archived').map((x) => x.title)).toEqual(['c']);
    expect(filterNotes(rows, 'pinned').map((x) => x.title)).toEqual(['b']);
    expect(filterNotes([n({ title: 'Trip plan', content: 'passport' })], 'all', { text: 'pass' })).toHaveLength(1);
  });

  it('compares editor fields structurally', () => {
    const a = { title: 'x', content: 'y', category: '', tags: ['t'], pinned: false, archived: false };
    expect(sameFields(a, { ...a, tags: ['t'] })).toBe(true);
    expect(sameFields(a, { ...a, content: 'z' })).toBe(false);
  });
});

describe('sync status', () => {
  it('tracks in-flight writes and offline state', async () => {
    syncStore.reset();
    syncStore.setOnline(true);
    let resolve!: () => void;
    const p = trackWrite(new Promise<void>((r) => (resolve = r)));
    expect(deriveStatus(syncStore.getState())).toBe('syncing');
    syncStore.setOnline(false);
    expect(deriveStatus(syncStore.getState())).toBe('offline-pending');
    resolve();
    await p;
    expect(deriveStatus(syncStore.getState())).toBe('offline');
    syncStore.setOnline(true);
    expect(deriveStatus(syncStore.getState())).toBe('synced');
  });

  it('reports pending writes seen in snapshots (e.g. queued before a reload)', () => {
    syncStore.reset();
    syncStore.reportSnapshot('k', { hasPendingWrites: true, fromCache: true });
    expect(deriveStatus(syncStore.getState())).toBe('syncing');
    syncStore.reportSnapshot('k', { hasPendingWrites: false, fromCache: false });
    expect(deriveStatus(syncStore.getState())).toBe('synced');
    expect(syncStore.getState().lastSyncedAt).not.toBeNull();
  });
});

describe('fresh note discarding', () => {
  it('treats only content-free, unpinned notes as blank', () => {
    expect(isBlankNote(EMPTY_NOTE)).toBe(true);
    expect(isBlankNote({ ...EMPTY_NOTE, title: '  ' })).toBe(true);
    expect(isBlankNote({ ...EMPTY_NOTE, content: 'x' })).toBe(false);
    expect(isBlankNote({ ...EMPTY_NOTE, tags: ['a'] })).toBe(false);
    expect(isBlankNote({ ...EMPTY_NOTE, pinned: true })).toBe(false);
  });

  it('discards after closing but not when the same note immediately remounts', () => {
    vi.useFakeTimers();
    try {
      const discard = vi.fn();
      markFresh('n1');
      scheduleDiscard('n1', discard);
      cancelDiscard('n1');
      vi.runAllTimers();
      expect(discard).not.toHaveBeenCalled();
      expect(isFresh('n1')).toBe(true);

      scheduleDiscard('n1', discard);
      vi.runAllTimers();
      expect(discard).toHaveBeenCalledOnce();
      expect(isFresh('n1')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
