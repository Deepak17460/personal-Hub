import { serverTimestamp, writeBatch, type Firestore } from 'firebase/firestore';
import { trackWrite } from '@/lib/sync/syncStore';
import type { Task, TaskFields, TaskStatus } from '@/types/models';
import { todayStr } from '@/utils/dates';
import { advance, NO_RECURRENCE } from '@/utils/recurrence';
import { docRef, newDocId } from './paths';
import { buildCreateData, pickFields, updateRecord, type WriteResult } from './records';

export const EMPTY_TASK: TaskFields = {
  title: '',
  description: '',
  priority: 'medium',
  status: 'todo',
  dueDate: null,
  category: '',
  tags: [],
  subtasks: [],
  recurrence: NO_RECURRENCE,
};

/** Fields for the next instance of a recurring task, or null if it does not recur. */
export function nextRecurringTask(task: TaskFields, today: string = todayStr()): TaskFields | null {
  if (task.recurrence.freq === 'none') return null;
  const nextDue = advance(task.dueDate ?? today, task.recurrence);
  if (!nextDue) return null;
  return {
    ...task,
    status: 'todo',
    dueDate: nextDue,
    subtasks: task.subtasks.map((s) => ({ ...s, done: false })),
  };
}

/**
 * Changes status. Completing a recurring task marks it done (and ends its series) while
 * creating the next instance atomically in the same batch.
 */
export function setTaskStatus(db: Firestore, uid: string, task: Task, status: TaskStatus): WriteResult {
  const fields = pickFields('tasks', task as unknown as Record<string, unknown>);
  const next = status === 'done' && task.status !== 'done' ? nextRecurringTask(fields) : null;
  if (!next) {
    return updateRecord(db, uid, 'tasks', task, { status }, { completedAt: status === 'done' ? serverTimestamp() : null });
  }
  const batch = writeBatch(db);
  const nextId = newDocId(db, uid, 'tasks');
  batch.set(
    docRef(db, uid, 'tasks', task.id),
    { status: 'done', recurrence: NO_RECURRENCE, completedAt: serverTimestamp(), updatedAt: serverTimestamp() },
    { merge: true },
  );
  batch.set(docRef(db, uid, 'tasks', nextId), buildCreateData('tasks', nextId, next));
  return { id: task.id, done: trackWrite(() => batch.commit()) };
}

export function toggleSubtask(db: Firestore, uid: string, task: Task, subtaskId: string): WriteResult {
  const subtasks = task.subtasks.map((s) => (s.id === subtaskId ? { ...s, done: !s.done } : s));
  return updateRecord(db, uid, 'tasks', task, { subtasks });
}

export const PRIORITY_ORDER: Record<Task['priority'], number> = { critical: 0, high: 1, medium: 2, low: 3 };

export function isOverdue(task: Pick<Task, 'dueDate' | 'status'>, today: string = todayStr()): boolean {
  return task.status !== 'done' && task.dueDate !== null && task.dueDate < today;
}
