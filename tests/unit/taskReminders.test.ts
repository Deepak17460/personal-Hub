import { describe, expect, it } from 'vitest';
import { dueTaskReminders, taskDueAt, taskReminderAt } from '@/features/tasks/taskReminders';
import { EMPTY_TASK } from '@/repositories/tasks';
import type { Task } from '@/types/models';

const now = new Date('2026-11-02T10:00:00');

function task(partial: Partial<Task>): Task {
  return {
    ...EMPTY_TASK,
    id: 't1',
    createdAt: now,
    updatedAt: now,
    schemaVersion: 1,
    completedAt: null,
    title: 'Submit report',
    ...partial,
  };
}

describe('taskReminders', () => {
  it('uses due time when set, otherwise 09:00', () => {
    expect(taskDueAt({ dueDate: '2026-11-02', dueTime: '14:30' })?.getHours()).toBe(14);
    expect(taskDueAt({ dueDate: '2026-11-02', dueTime: null })?.getHours()).toBe(9);
    expect(taskDueAt({ dueDate: null, dueTime: '14:30' })).toBeNull();
  });

  it('schedules reminderMinutes before due', () => {
    const at = taskReminderAt({
      dueDate: '2026-11-02',
      dueTime: '10:30',
      reminderMinutes: 30,
      status: 'todo',
    });
    expect(at?.toISOString()).toBe(new Date('2026-11-02T10:00:00').toISOString());
  });

  it('skips done tasks and tasks without reminders', () => {
    expect(taskReminderAt({ dueDate: '2026-11-02', dueTime: '10:00', reminderMinutes: 0, status: 'done' })).toBeNull();
    expect(taskReminderAt({ dueDate: '2026-11-02', dueTime: '10:00', reminderMinutes: null, status: 'todo' })).toBeNull();
  });

  it('returns due reminders once within the window', () => {
    const due = dueTaskReminders(
      [
        task({ dueDate: '2026-11-02', dueTime: '10:15', reminderMinutes: 15 }),
        task({ id: 't2', dueDate: '2026-11-02', dueTime: '18:00', reminderMinutes: 0 }),
      ],
      now,
      new Set(),
    );
    expect(due).toHaveLength(1);
    expect(due[0]?.key).toContain('t1');
    expect(dueTaskReminders([task({ dueDate: '2026-11-02', dueTime: '10:15', reminderMinutes: 15 })], now, new Set(['task:t1@2026-11-02T10:15']))).toHaveLength(0);
  });
});
