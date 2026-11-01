import { describe, expect, it } from 'vitest';
import { buildReminderCopy, buildTaskReminderCopy, buildTestReminderCopy } from '@/features/calendar/reminderCopy';
import type { Occurrence } from '@/features/calendar/occurrences';
import { EMPTY_TASK } from '@/repositories/tasks';
import type { CalendarEvent, Task } from '@/types/models';

const now = new Date('2026-11-02T08:00:00');

function occ(partial: Partial<CalendarEvent> & { date?: string }): Occurrence {
  const event: CalendarEvent = {
    id: 'e1',
    createdAt: now,
    updatedAt: now,
    schemaVersion: 1,
    title: 'Standup',
    description: 'Share wins and blockers',
    date: partial.date ?? '2026-11-02',
    time: '09:00',
    kind: 'reminder',
    recurrence: { freq: 'none', interval: 1 },
    reminderMinutes: 30,
    ...partial,
  };
  return { key: `${event.id}@${event.date}`, date: event.date, event };
}

describe('reminderCopy', () => {
  it('builds a friendly title and body for a due reminder', () => {
    const copy = buildReminderCopy(occ({}), now);
    expect(copy.title).toContain('Standup');
    expect(copy.body).toMatch(/today/i);
    expect(copy.body).toContain('Share wins and blockers');
    expect(copy.tag).toContain('e1@2026-11-02');
  });

  it('builds a test reminder payload', () => {
    const copy = buildTestReminderCopy();
    expect(copy.title).toMatch(/test reminder/i);
    expect(copy.body.length).toBeGreaterThan(20);
  });

  it('builds task reminder copy with due time', () => {
    const task: Task = {
      ...EMPTY_TASK,
      id: 't1',
      createdAt: now,
      updatedAt: now,
      schemaVersion: 1,
      completedAt: null,
      title: 'Pay rent',
      description: 'Transfer before cutoff',
      dueDate: '2026-11-02',
      dueTime: '09:30',
      reminderMinutes: 30,
    };
    const copy = buildTaskReminderCopy(task, now);
    expect(copy.title).toContain('Pay rent');
    expect(copy.body).toMatch(/task due/i);
    expect(copy.body).toContain('Transfer before cutoff');
    expect(copy.tag).toContain('t1');
  });
});
