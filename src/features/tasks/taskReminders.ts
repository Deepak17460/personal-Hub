import type { Task } from '@/types/models';
import { parseDateStr } from '@/utils/dates';
import { ALL_DAY_REMINDER_TIME } from '@/features/calendar/occurrences';

export interface TaskReminderDue {
  key: string;
  task: Task;
  at: Date;
}

/** Local due instant for a task (all-day → 09:00). */
export function taskDueAt(task: Pick<Task, 'dueDate' | 'dueTime'>): Date | null {
  if (!task.dueDate) return null;
  const d = parseDateStr(task.dueDate);
  const [h, m] = (task.dueTime ?? ALL_DAY_REMINDER_TIME).split(':').map(Number);
  d.setHours(h ?? 9, m ?? 0, 0, 0);
  return d;
}

/** When the notification should fire (dueAt − reminderMinutes). */
export function taskReminderAt(task: Pick<Task, 'dueDate' | 'dueTime' | 'reminderMinutes' | 'status'>): Date | null {
  if (task.status === 'done' || task.reminderMinutes == null) return null;
  const due = taskDueAt(task);
  if (!due) return null;
  return new Date(due.getTime() - task.reminderMinutes * 60_000);
}

export function dueTaskReminders(
  tasks: Task[] | undefined,
  now: Date,
  fired: ReadonlySet<string>,
  windowMs = 6 * 3_600_000,
): TaskReminderDue[] {
  const out: TaskReminderDue[] = [];
  for (const task of tasks ?? []) {
    const at = taskReminderAt(task);
    if (!at || !task.dueDate) continue;
    const key = `task:${task.id}@${task.dueDate}${task.dueTime ? `T${task.dueTime}` : ''}`;
    if (fired.has(key)) continue;
    const delta = now.getTime() - at.getTime();
    if (delta >= 0 && delta <= windowMs) out.push({ key, task, at });
  }
  return out;
}
