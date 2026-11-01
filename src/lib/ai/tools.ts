import { getDoc, getDocs, type Firestore } from 'firebase/firestore';
import { createNote, EMPTY_NOTE, noteFieldsOf, saveNote } from '@/repositories/notes';
import { fetchTaskCounts, queries, searchCollection } from '@/repositories/queries';
import { createRecord, deleteRecord, updateRecord } from '@/repositories/records';
import { EMPTY_TASK, setTaskStatus } from '@/repositories/tasks';
import { docRef } from '@/repositories/paths';
import { mapSnapshot } from '@/repositories/mappers';
import type {
  Bookmark,
  BookmarkFields,
  CollectionName,
  DocumentFields,
  EventFields,
  Note,
  NoteFields,
  Priority,
  Task,
  TaskFields,
  TaskStatus,
} from '@/types/models';
import { COLLECTIONS } from '@/types/models';
import { addDays, todayStr } from '@/utils/dates';
import { randomId } from '@/utils/ids';
import { NO_RECURRENCE } from '@/utils/recurrence';
import { hostnameOf, normalizeUrl } from '@/utils/url';
import type { ActionResult, HubAction } from './types';

const NOTE_CONTENT_CAP = 12_000;

export interface ToolContext {
  db: Firestore;
  uid: string;
}

const PRIORITIES = new Set(['low', 'medium', 'high', 'critical']);
const STATUSES = new Set(['todo', 'in_progress', 'done']);
const EVENT_KINDS = new Set(['event', 'important', 'reminder']);

function str(args: Record<string, unknown>, key: string, fallback = ''): string {
  const v = args[key];
  return typeof v === 'string' ? v.trim() : fallback;
}

function bool(args: Record<string, unknown>, key: string, fallback = false): boolean {
  const v = args[key];
  return typeof v === 'boolean' ? v : fallback;
}

function strList(args: Record<string, unknown>, key: string): string[] {
  const v = args[key];
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter(Boolean);
}

function asPriority(value: string): Priority {
  return PRIORITIES.has(value) ? (value as Priority) : 'medium';
}

function asStatus(value: string): TaskStatus {
  return STATUSES.has(value) ? (value as TaskStatus) : 'todo';
}

function summarizeRecord(kind: string, id: string, title: string, path: string): ActionResult {
  return {
    name: kind,
    ok: true,
    summary: `${kind.replace(/_/g, ' ')}: ${title || 'Untitled'}`,
    link: path,
    data: { id, title },
  };
}

function clip(text: string, max = 280): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

async function searchHub(ctx: ToolContext, args: Record<string, unknown>): Promise<ActionResult> {
  const query = str(args, 'query');
  if (!query) return { name: 'search_hub', ok: false, summary: 'Missing search query' };
  const rawCollections = strList(args, 'collections');
  const collections = (rawCollections.length ? rawCollections : [...COLLECTIONS]).filter((c): c is CollectionName =>
    (COLLECTIONS as readonly string[]).includes(c),
  );
  const limit = Math.min(Math.max(Number(args.limit) || 5, 1), 10);
  const results: Record<string, { id: string; title: string; snippet?: string; url?: string }[]> = {};
  for (const c of collections) {
    const rows = await searchCollection(ctx.db, ctx.uid, c, query, limit);
    results[c] = rows.map((r) => {
      if (c === 'notes') {
        const note = r as Note;
        return { id: note.id, title: note.title || 'Untitled', snippet: clip(note.content) };
      }
      if (c === 'bookmarks') {
        const b = r as Bookmark;
        return { id: b.id, title: b.title, url: b.url, snippet: clip(b.description || b.url) };
      }
      const row = r as { id: string; title?: string; description?: string };
      return { id: row.id, title: row.title ?? '', snippet: row.description ? clip(row.description) : undefined };
    });
  }
  const total = Object.values(results).reduce((n, rows) => n + rows.length, 0);
  return {
    name: 'search_hub',
    ok: true,
    summary: total ? `Found ${total} match(es) for “${query}”` : `No matches for “${query}”`,
    link: `/search?q=${encodeURIComponent(query)}`,
    data: results,
  };
}

async function readNoteAction(ctx: ToolContext, args: Record<string, unknown>): Promise<ActionResult> {
  const id = str(args, 'id');
  const query = str(args, 'query') || str(args, 'title');
  let note: Note | null = null;

  if (id) {
    const snap = await getDoc(docRef(ctx.db, ctx.uid, 'notes', id));
    if (snap.exists()) note = mapSnapshot('notes', snap);
  } else if (query) {
    const hits = await searchCollection(ctx.db, ctx.uid, 'notes', query, 5);
    note = hits[0] ?? null;
    if (!note) {
      return { name: 'read_note', ok: false, summary: `No note matched “${query}”` };
    }
  } else {
    return { name: 'read_note', ok: false, summary: 'Provide note id or query/title' };
  }

  if (!note) return { name: 'read_note', ok: false, summary: `Note ${id} not found` };

  const content =
    note.content.length > NOTE_CONTENT_CAP
      ? `${note.content.slice(0, NOTE_CONTENT_CAP)}\n\n…[truncated]`
      : note.content;

  return {
    name: 'read_note',
    ok: true,
    summary: `Read “${note.title || 'Untitled'}” (${note.content.length} chars)`,
    link: `/notes/${note.id}`,
    data: {
      id: note.id,
      title: note.title,
      content,
      category: note.category,
      tags: note.tags,
      pinned: note.pinned,
      archived: note.archived,
      updatedAt: note.updatedAt.toISOString(),
    },
  };
}

async function listRecentNotes(ctx: ToolContext, args: Record<string, unknown>): Promise<ActionResult> {
  const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 25);
  const snap = await getDocs(queries.recent(ctx.db, ctx.uid, 'notes', limit));
  const notes = snap.docs.map((d) => mapSnapshot('notes', d));
  return {
    name: 'list_recent_notes',
    ok: true,
    summary: `${notes.length} recent note(s)`,
    link: '/notes',
    data: notes.map((n) => ({
      id: n.id,
      title: n.title || 'Untitled',
      snippet: clip(n.content),
      pinned: n.pinned,
      tags: n.tags,
      category: n.category,
    })),
  };
}

async function updateNoteAction(ctx: ToolContext, args: Record<string, unknown>): Promise<ActionResult> {
  const id = str(args, 'id');
  if (!id) return { name: 'update_note', ok: false, summary: 'Note id is required' };
  const snap = await getDoc(docRef(ctx.db, ctx.uid, 'notes', id));
  if (!snap.exists()) return { name: 'update_note', ok: false, summary: `Note ${id} not found` };
  const note = mapSnapshot('notes', snap);
  const fields: NoteFields = {
    ...noteFieldsOf(note),
    ...(typeof args.title === 'string' ? { title: args.title.trim() } : {}),
    ...(typeof args.content === 'string' ? { content: args.content } : {}),
    ...(typeof args.category === 'string' ? { category: args.category.trim() } : {}),
    ...(Array.isArray(args.tags) ? { tags: strList(args, 'tags') } : {}),
    ...(typeof args.pinned === 'boolean' ? { pinned: args.pinned } : {}),
    ...(typeof args.archived === 'boolean' ? { archived: args.archived } : {}),
  };
  saveNote(ctx.db, ctx.uid, note.id, note.revId, fields);
  return {
    name: 'update_note',
    ok: true,
    summary: `Updated note “${fields.title || 'Untitled'}”`,
    link: `/notes/${note.id}`,
    data: { id: note.id, title: fields.title },
  };
}

async function appendNoteAction(ctx: ToolContext, args: Record<string, unknown>): Promise<ActionResult> {
  const id = str(args, 'id');
  const text = str(args, 'text') || str(args, 'content');
  if (!id || !text) return { name: 'append_note', ok: false, summary: 'Note id and text are required' };
  const snap = await getDoc(docRef(ctx.db, ctx.uid, 'notes', id));
  if (!snap.exists()) return { name: 'append_note', ok: false, summary: `Note ${id} not found` };
  const note = mapSnapshot('notes', snap);
  const sep = note.content.trim() ? '\n\n' : '';
  const fields: NoteFields = { ...noteFieldsOf(note), content: `${note.content}${sep}${text}` };
  saveNote(ctx.db, ctx.uid, note.id, note.revId, fields);
  return {
    name: 'append_note',
    ok: true,
    summary: `Appended to “${note.title || 'Untitled'}”`,
    link: `/notes/${note.id}`,
    data: { id: note.id, title: note.title },
  };
}

async function listBookmarksAction(ctx: ToolContext, args: Record<string, unknown>): Promise<ActionResult> {
  const favoritesOnly = bool(args, 'favoritesOnly');
  const limit = Math.min(Math.max(Number(args.limit) || 15, 1), 40);
  const snap = favoritesOnly
    ? await getDocs(queries.favoriteBookmarks(ctx.db, ctx.uid, limit))
    : await getDocs(queries.recent(ctx.db, ctx.uid, 'bookmarks', limit));
  const bookmarks = snap.docs.map((d) => mapSnapshot('bookmarks', d));
  return {
    name: 'list_bookmarks',
    ok: true,
    summary: `${bookmarks.length} bookmark(s)`,
    link: '/bookmarks',
    data: bookmarks.map((b) => ({
      id: b.id,
      title: b.title,
      url: b.url,
      description: b.description,
      favorite: b.favorite,
      tags: b.tags,
      category: b.category,
    })),
  };
}

async function updateBookmarkAction(ctx: ToolContext, args: Record<string, unknown>): Promise<ActionResult> {
  const id = str(args, 'id');
  if (!id) return { name: 'update_bookmark', ok: false, summary: 'Bookmark id is required' };
  const snap = await getDoc(docRef(ctx.db, ctx.uid, 'bookmarks', id));
  if (!snap.exists()) return { name: 'update_bookmark', ok: false, summary: `Bookmark ${id} not found` };
  const bookmark = mapSnapshot('bookmarks', snap);
  const patch: Partial<BookmarkFields> = {};
  if (typeof args.title === 'string') patch.title = args.title.trim();
  if (typeof args.url === 'string') patch.url = normalizeUrl(args.url);
  if (typeof args.description === 'string') patch.description = args.description;
  if (typeof args.category === 'string') patch.category = args.category.trim();
  if (Array.isArray(args.tags)) patch.tags = strList(args, 'tags');
  if (typeof args.favorite === 'boolean') patch.favorite = args.favorite;
  if (!Object.keys(patch).length) return { name: 'update_bookmark', ok: false, summary: 'No fields to update' };
  updateRecord(ctx.db, ctx.uid, 'bookmarks', bookmark, patch);
  return {
    name: 'update_bookmark',
    ok: true,
    summary: `Updated bookmark “${patch.title ?? bookmark.title}”`,
    link: '/bookmarks',
    data: { id, ...patch },
  };
}

async function listOpenTasks(ctx: ToolContext, args: Record<string, unknown>): Promise<ActionResult> {
  const dueBy = str(args, 'dueBy') || todayStr();
  const snap = await getDocs(queries.openTasksDueBy(ctx.db, ctx.uid, dueBy, 30));
  const tasks = snap.docs.map((d) => mapSnapshot('tasks', d));
  return {
    name: 'list_open_tasks',
    ok: true,
    summary: `${tasks.length} open task(s) due by ${dueBy}`,
    link: '/tasks',
    data: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      dueDate: t.dueDate,
    })),
  };
}

async function listUpcomingEvents(ctx: ToolContext, args: Record<string, unknown>): Promise<ActionResult> {
  const from = str(args, 'from') || todayStr();
  const to = str(args, 'to') || addDays(from, 14);
  const snap = await getDocs(queries.eventsBetween(ctx.db, ctx.uid, from, to));
  const events = snap.docs.map((d) => mapSnapshot('events', d));
  return {
    name: 'list_upcoming_events',
    ok: true,
    summary: `${events.length} event(s) from ${from} to ${to}`,
    link: '/calendar',
    data: events.map((e) => ({
      id: e.id,
      title: e.title,
      date: e.date,
      time: e.time,
      kind: e.kind,
    })),
  };
}

async function getCounts(ctx: ToolContext): Promise<ActionResult> {
  const today = todayStr();
  const counts = await fetchTaskCounts(ctx.db, ctx.uid, today);
  return {
    name: 'get_task_counts',
    ok: true,
    summary: `Open ${counts.open}, overdue ${counts.overdue}, done ${counts.done}`,
    link: '/tasks',
    data: { today, ...counts },
  };
}

function createNoteAction(ctx: ToolContext, args: Record<string, unknown>): ActionResult {
  const fields: NoteFields = {
    ...EMPTY_NOTE,
    title: str(args, 'title') || 'Untitled',
    content: str(args, 'content'),
    category: str(args, 'category'),
    tags: strList(args, 'tags'),
    pinned: bool(args, 'pinned'),
  };
  const { id } = createNote(ctx.db, ctx.uid, fields);
  return summarizeRecord('create_note', id, fields.title, `/notes/${id}`);
}

function createTaskAction(ctx: ToolContext, args: Record<string, unknown>): ActionResult {
  const due = str(args, 'dueDate');
  const dueTime = str(args, 'dueTime') || str(args, 'time');
  const reminderMinutes = parseReminderMinutes(args, null);
  const fields: TaskFields = {
    ...EMPTY_TASK,
    title: str(args, 'title'),
    description: str(args, 'description'),
    priority: asPriority(str(args, 'priority', 'medium')),
    status: asStatus(str(args, 'status', 'todo')),
    dueDate: due || null,
    dueTime: due ? dueTime || null : null,
    reminderMinutes: due ? reminderMinutes : null,
    category: str(args, 'category'),
    tags: strList(args, 'tags'),
    subtasks: [],
    recurrence: NO_RECURRENCE,
  };
  if (!fields.title) return { name: 'create_task', ok: false, summary: 'Task title is required' };
  const { id } = createRecord(ctx.db, ctx.uid, 'tasks', fields);
  const when =
    fields.dueDate == null
      ? ''
      : fields.dueTime
        ? ` · due ${fields.dueDate} ${fields.dueTime}`
        : ` · due ${fields.dueDate}`;
  const remind =
    fields.reminderMinutes == null
      ? ''
      : fields.reminderMinutes === 0
        ? ' · reminds at due time'
        : ` · reminds ${fields.reminderMinutes} min before`;
  return {
    name: 'create_task',
    ok: true,
    summary: `Created task “${fields.title}”${when}${remind}`,
    link: '/tasks',
    data: { id, title: fields.title, dueDate: fields.dueDate, dueTime: fields.dueTime, reminderMinutes: fields.reminderMinutes },
  };
}

function createBookmarkAction(ctx: ToolContext, args: Record<string, unknown>): ActionResult {
  const url = normalizeUrl(str(args, 'url'));
  if (!url) return { name: 'create_bookmark', ok: false, summary: 'Bookmark URL is required' };
  const title = str(args, 'title') || hostnameOf(url) || url;
  const fields: BookmarkFields = {
    url,
    title,
    description: str(args, 'description'),
    category: str(args, 'category'),
    tags: strList(args, 'tags'),
    favorite: bool(args, 'favorite'),
  };
  const { id } = createRecord(ctx.db, ctx.uid, 'bookmarks', fields);
  return summarizeRecord('create_bookmark', id, fields.title, '/bookmarks');
}

function parseReminderMinutes(args: Record<string, unknown>, fallback: number | null): number | null {
  const raw = args.reminderMinutes ?? args.remindBeforeMinutes ?? args.alarmMinutes;
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.max(0, Math.round(raw));
  if (typeof raw === 'string') {
    const t = raw.trim().toLowerCase();
    if (!t || t === 'none' || t === 'null') return null;
    const asNum = Number(t);
    if (Number.isFinite(asNum)) return Math.max(0, Math.round(asNum));
    const m = /^(\d+)\s*(m|min|mins|minute|minutes)?$/.exec(t);
    if (m) return Math.max(0, Number(m[1]));
    const h = /^(\d+)\s*(h|hr|hour|hours)$/.exec(t);
    if (h) return Math.max(0, Number(h[1]) * 60);
  }
  return fallback;
}

function createEventAction(ctx: ToolContext, args: Record<string, unknown>, actionName = 'create_event'): ActionResult {
  const date = str(args, 'date');
  const title = str(args, 'title');
  if (!title || !date) return { name: actionName, ok: false, summary: 'Event title and date are required' };
  const isAlarm = actionName === 'set_alarm' || actionName === 'create_reminder' || bool(args, 'alarm');
  const kindRaw = str(args, 'kind', isAlarm ? 'reminder' : 'event');
  const time = str(args, 'time');
  const reminderMinutes = parseReminderMinutes(args, isAlarm ? (time ? 0 : 15) : null);
  const fields: EventFields = {
    title,
    description: str(args, 'description'),
    date,
    time: time || null,
    kind: EVENT_KINDS.has(kindRaw) ? (kindRaw as EventFields['kind']) : isAlarm ? 'reminder' : 'event',
    recurrence: NO_RECURRENCE,
    reminderMinutes,
  };
  const { id } = createRecord(ctx.db, ctx.uid, 'events', fields);
  const when = time ? `${date} ${time}` : date;
  const alarmNote =
    reminderMinutes == null
      ? ''
      : reminderMinutes === 0
        ? ' · alarm at event time'
        : ` · reminds ${reminderMinutes} min before`;
  return {
    name: actionName,
    ok: true,
    summary: `${isAlarm ? 'Alarm' : 'Event'} “${fields.title}” on ${when}${alarmNote}`,
    link: '/calendar',
    data: { id, title: fields.title, date, time: fields.time, reminderMinutes },
  };
}

function createDocumentAction(ctx: ToolContext, args: Record<string, unknown>): ActionResult {
  const title = str(args, 'title');
  if (!title) return { name: 'create_document', ok: false, summary: 'Document title is required' };
  const external = str(args, 'externalUrl');
  const fields: DocumentFields = {
    title,
    description: str(args, 'description'),
    category: str(args, 'category'),
    tags: strList(args, 'tags'),
    externalUrl: external ? normalizeUrl(external) : null,
    storageProvider: str(args, 'storageProvider') || (external ? 'link' : ''),
    fileType: str(args, 'fileType'),
    fileSizeBytes: null,
  };
  const { id } = createRecord(ctx.db, ctx.uid, 'documents', fields);
  return summarizeRecord('create_document', id, fields.title, '/documents');
}

async function updateTaskStatusAction(ctx: ToolContext, args: Record<string, unknown>): Promise<ActionResult> {
  const id = str(args, 'id');
  const status = asStatus(str(args, 'status'));
  if (!id) return { name: 'update_task_status', ok: false, summary: 'Task id is required' };
  const snap = await getDoc(docRef(ctx.db, ctx.uid, 'tasks', id));
  if (!snap.exists()) return { name: 'update_task_status', ok: false, summary: `Task ${id} not found` };
  const task = mapSnapshot('tasks', snap);
  setTaskStatus(ctx.db, ctx.uid, task, status);
  return {
    name: 'update_task_status',
    ok: true,
    summary: `Marked “${task.title}” as ${status}`,
    link: '/tasks',
    data: { id, status },
  };
}

async function updateTaskAction(ctx: ToolContext, args: Record<string, unknown>): Promise<ActionResult> {
  const id = str(args, 'id');
  if (!id) return { name: 'update_task', ok: false, summary: 'Task id is required' };
  const snap = await getDoc(docRef(ctx.db, ctx.uid, 'tasks', id));
  if (!snap.exists()) return { name: 'update_task', ok: false, summary: `Task ${id} not found` };
  const task = mapSnapshot('tasks', snap);
  const patch: Partial<TaskFields> = {};
  if (typeof args.title === 'string') patch.title = args.title.trim();
  if (typeof args.description === 'string') patch.description = args.description;
  if (typeof args.priority === 'string') patch.priority = asPriority(args.priority);
  if (typeof args.dueDate === 'string') patch.dueDate = args.dueDate.trim() || null;
  if (typeof args.dueTime === 'string' || typeof args.time === 'string') {
    const t = str(args, 'dueTime') || str(args, 'time');
    patch.dueTime = t || null;
  }
  if ('reminderMinutes' in args || 'remindBeforeMinutes' in args) {
    patch.reminderMinutes = parseReminderMinutes(args, null);
  }
  if (typeof args.category === 'string') patch.category = args.category.trim();
  if (Array.isArray(args.tags)) patch.tags = strList(args, 'tags');
  const nextDue = patch.dueDate !== undefined ? patch.dueDate : task.dueDate;
  if (!nextDue) {
    patch.dueTime = null;
    patch.reminderMinutes = null;
  }

  let statusChanged: TaskStatus | null = null;
  if (typeof args.status === 'string') {
    const status = asStatus(args.status);
    if (status !== task.status) statusChanged = status;
  }

  if (!Object.keys(patch).length && !statusChanged) {
    return { name: 'update_task', ok: false, summary: 'No fields to update' };
  }

  if (statusChanged) setTaskStatus(ctx.db, ctx.uid, task, statusChanged);
  if (Object.keys(patch).length) updateRecord(ctx.db, ctx.uid, 'tasks', task, patch);

  return {
    name: 'update_task',
    ok: true,
    summary: `Updated “${patch.title ?? task.title}”`,
    link: '/tasks',
    data: { id, ...patch, ...(statusChanged ? { status: statusChanged } : {}) },
  };
}

async function addSubtaskAction(ctx: ToolContext, args: Record<string, unknown>): Promise<ActionResult> {
  const id = str(args, 'id');
  const title = str(args, 'title');
  if (!id || !title) return { name: 'add_subtask', ok: false, summary: 'Task id and subtask title are required' };
  const snap = await getDoc(docRef(ctx.db, ctx.uid, 'tasks', id));
  if (!snap.exists()) return { name: 'add_subtask', ok: false, summary: `Task ${id} not found` };
  const task = mapSnapshot('tasks', snap) as Task;
  const subtasks = [...task.subtasks, { id: randomId(12), title, done: false }];
  updateRecord(ctx.db, ctx.uid, 'tasks', task, { subtasks });
  return {
    name: 'add_subtask',
    ok: true,
    summary: `Added subtask “${title}” to “${task.title}”`,
    link: '/tasks',
    data: { id, title },
  };
}

async function resolveTask(ctx: ToolContext, args: Record<string, unknown>): Promise<Task | null> {
  const id = str(args, 'id');
  if (id) {
    const snap = await getDoc(docRef(ctx.db, ctx.uid, 'tasks', id));
    return snap.exists() ? (mapSnapshot('tasks', snap) as Task) : null;
  }
  const query = str(args, 'query') || str(args, 'title');
  if (!query) return null;
  const matches = (await searchCollection(ctx.db, ctx.uid, 'tasks', query, 5)) as Task[];
  if (!matches.length) return null;
  const exact = matches.find((t) => t.title.toLowerCase() === query.toLowerCase());
  return exact ?? matches[0] ?? null;
}

async function deleteTaskAction(ctx: ToolContext, args: Record<string, unknown>): Promise<ActionResult> {
  const idHint = str(args, 'id');
  const query = str(args, 'query') || str(args, 'title');
  if (!idHint && !query) {
    return { name: 'delete_task', ok: false, summary: 'Provide task id or title/query to delete' };
  }
  const task = await resolveTask(ctx, args);
  if (!task) {
    return {
      name: 'delete_task',
      ok: false,
      summary: idHint ? `Task ${idHint} not found` : `No task matched “${query}”`,
    };
  }
  deleteRecord(ctx.db, ctx.uid, 'tasks', task.id);
  return {
    name: 'delete_task',
    ok: true,
    summary: `Deleted task “${task.title}”`,
    link: '/tasks',
    data: { id: task.id, title: task.title },
  };
}

/** Tool catalogue described to the model (gateway does not forward native OpenAI tools). */
export const TOOL_CATALOG = `
Available actions (emit ONLY when the user wants something done in the hub):

Read / find:
- search_hub: { "query": string, "collections"?: ("notes"|"tasks"|"bookmarks"|"documents"|"events")[], "limit"?: number }
- read_note: { "id"?: string, "query"?: string, "title"?: string }  // returns full note body
- list_recent_notes: { "limit"?: number }
- list_bookmarks: { "favoritesOnly"?: boolean, "limit"?: number }
- list_open_tasks: { "dueBy"?: "YYYY-MM-DD" }
- list_upcoming_events: { "from"?: "YYYY-MM-DD", "to"?: "YYYY-MM-DD" }
- get_task_counts: {}

Notes:
- create_note: { "title"?: string, "content"?: string, "category"?: string, "tags"?: string[], "pinned"?: boolean }
- update_note: { "id": string, "title"?: string, "content"?: string, "category"?: string, "tags"?: string[], "pinned"?: boolean, "archived"?: boolean }
- append_note: { "id": string, "text": string }  // append markdown/text to an existing note

Tasks:
- create_task: { "title": string, "description"?: string, "priority"?: "low"|"medium"|"high"|"critical", "status"?: "todo"|"in_progress"|"done", "dueDate"?: "YYYY-MM-DD"|null, "dueTime"?: "HH:MM"|null, "reminderMinutes"?: number|string|null, "category"?: string, "tags"?: string[] }
- update_task: { "id": string, "title"?: string, "description"?: string, "priority"?: string, "status"?: string, "dueDate"?: string|null, "dueTime"?: "HH:MM"|null, "reminderMinutes"?: number|string|null, "category"?: string, "tags"?: string[] }
- update_task_status: { "id": string, "status": "todo"|"in_progress"|"done" }
- add_subtask: { "id": string, "title": string }
- delete_task (aliases: remove_task): { "id"?: string, "query"?: string, "title"?: string }  // permanently deletes a task; look up with list_open_tasks / search_hub first when unsure

Links / bookmarks / docs / calendar:
- create_bookmark (aliases: add_link, save_link): { "url": string, "title"?: string, "description"?: string, "category"?: string, "tags"?: string[], "favorite"?: boolean }
- update_bookmark: { "id": string, "url"?: string, "title"?: string, "description"?: string, "category"?: string, "tags"?: string[], "favorite"?: boolean }
- create_event: { "title": string, "date": "YYYY-MM-DD", "time"?: "HH:MM", "description"?: string, "kind"?: "event"|"important"|"reminder", "reminderMinutes"?: number|string|null }
- set_alarm / create_reminder: { "title": string, "date": "YYYY-MM-DD", "time"?: "HH:MM", "description"?: string, "reminderMinutes"?: number|string }  // calendar reminder/alarm; reminderMinutes=0 fires at event time, 15 = 15 minutes before
- create_document: { "title": string, "description"?: string, "externalUrl"?: string, "category"?: string, "tags"?: string[], "storageProvider"?: string, "fileType"?: string }

When you need to run one or more actions, include this block in your reply (you may also write a short human message):
<hub_actions>
[{"name":"create_task","args":{"title":"Buy milk","dueDate":"2026-11-03"}}]
</hub_actions>

Rules:
- Prefer actions over telling the user to click around the UI.
- When asked to summarize, explain, or find something in a note: call read_note (or search_hub then read_note) and answer from the returned content.
- When asked to save/add a link/URL/website: use create_bookmark / add_link.
- When asked to set an event, meeting, calendar item, reminder, or alarm: use create_event or set_alarm with date/time and reminderMinutes (alarms should include time when possible).
- When asked to create a task due at a specific time or with a notification: use create_task with dueDate, dueTime, and reminderMinutes (0 = at due time).
- Use today's date context from the system prompt for relative dates ("tomorrow", "next week", "in 10 minutes").
- Look up ids with search_hub / list_* before update_* or delete_task.
- Only delete tasks when the user clearly asks to delete/remove a task. Do not delete notes, bookmarks, documents, or events.
- If the user only wants advice or drafting text, reply normally with NO <hub_actions> block.
`.trim();

function normalizeActionName(name: string): string {
  switch (name) {
    case 'add_link':
    case 'save_link':
    case 'save_bookmark':
    case 'add_bookmark':
      return 'create_bookmark';
    case 'get_note':
    case 'open_note':
    case 'show_note':
      return 'read_note';
    case 'list_notes':
      return 'list_recent_notes';
    case 'remove_task':
    case 'delete_tasks':
      return 'delete_task';
    case 'set_alarm':
    case 'create_reminder':
    case 'add_reminder':
    case 'set_reminder':
    case 'create_alarm':
      return 'set_alarm';
    case 'add_event':
    case 'schedule_event':
      return 'create_event';
    default:
      return name;
  }
}

export async function executeHubAction(ctx: ToolContext, action: HubAction): Promise<ActionResult> {
  const name = normalizeActionName(action.name);
  try {
    switch (name) {
      case 'search_hub':
        return await searchHub(ctx, action.args);
      case 'read_note':
        return await readNoteAction(ctx, action.args);
      case 'list_recent_notes':
        return await listRecentNotes(ctx, action.args);
      case 'list_bookmarks':
        return await listBookmarksAction(ctx, action.args);
      case 'list_open_tasks':
        return await listOpenTasks(ctx, action.args);
      case 'list_upcoming_events':
        return await listUpcomingEvents(ctx, action.args);
      case 'get_task_counts':
        return await getCounts(ctx);
      case 'create_note':
        return createNoteAction(ctx, action.args);
      case 'update_note':
        return await updateNoteAction(ctx, action.args);
      case 'append_note':
        return await appendNoteAction(ctx, action.args);
      case 'create_task':
        return createTaskAction(ctx, action.args);
      case 'update_task':
        return await updateTaskAction(ctx, action.args);
      case 'update_task_status':
        return await updateTaskStatusAction(ctx, action.args);
      case 'add_subtask':
        return await addSubtaskAction(ctx, action.args);
      case 'delete_task':
        return await deleteTaskAction(ctx, action.args);
      case 'create_bookmark':
        return createBookmarkAction(ctx, action.args);
      case 'update_bookmark':
        return await updateBookmarkAction(ctx, action.args);
      case 'create_event':
        return createEventAction(ctx, action.args, 'create_event');
      case 'set_alarm':
        return createEventAction(ctx, action.args, 'set_alarm');
      case 'create_document':
        return createDocumentAction(ctx, action.args);
      case 'delete_record':
      case 'delete_note':
      case 'delete_bookmark':
      case 'delete_document':
      case 'delete_event':
        return {
          name,
          ok: false,
          summary: 'Only task deletes are allowed from the assistant. Use the app UI for other items.',
        };
      default:
        return { name, ok: false, summary: `Unknown action “${action.name}”` };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Action failed';
    return { name, ok: false, summary: message };
  }
}
