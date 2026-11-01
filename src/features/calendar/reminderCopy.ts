import type { Task } from '@/types/models';
import { todayStr } from '@/utils/dates';
import { taskDueAt } from '@/features/tasks/taskReminders';
import type { Occurrence } from './occurrences';
import { occurrenceStart } from './occurrences';

export const REMINDER_IMAGE = '/reminder-cartoon.jpg';
export const REMINDER_ICON = '/reminder-cartoon.jpg';
export const REMINDER_BADGE = '/pwa-192.png';

const KIND_LABEL: Record<string, string> = {
  event: 'Event',
  important: 'Important',
  reminder: 'Reminder',
};

function formatClock(d: Date): string {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(d);
}

function formatDay(dateStr: string, now = new Date()): string {
  const today = todayStr(now);
  if (dateStr === today) return 'today';
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (dateStr === todayStr(tomorrow)) return 'tomorrow';
  return new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(
    new Date(`${dateStr}T12:00:00`),
  );
}

function leadIn(mins: number, day: string): string {
  if (mins <= 0) return 'It’s time';
  if (mins < 60) return `In ${mins} min`;
  if (mins < 24 * 60) return `In about ${Math.round(mins / 60)} hr`;
  return `Coming up ${day}`;
}

/** Friendly title + body for system notifications and in-app reminder cards. */
export function buildReminderCopy(o: Occurrence, now: Date = new Date()): { title: string; body: string; tag: string } {
  const title = o.event.title.trim() || 'Upcoming reminder';
  const kind = KIND_LABEL[o.event.kind] ?? 'Reminder';
  const start = occurrenceStart(o);
  const day = formatDay(o.date, now);
  const clock = o.event.time ? formatClock(start) : 'all day';
  const mins = Math.round((start.getTime() - now.getTime()) / 60_000);
  const lines = [
    `${leadIn(mins, day)} · ${kind.toLowerCase()} ${day} · ${clock}`,
    o.event.description?.trim() ? o.event.description.trim().slice(0, 140) : 'A gentle nudge from Personal Hub — you’ve got this.',
  ];

  return {
    title: `⏰ ${title}`,
    body: lines.join('\n'),
    tag: `hub-reminder-${o.key}`,
  };
}

/** Task due reminder copy (same cartoon/system notification style as calendar). */
export function buildTaskReminderCopy(task: Task, now: Date = new Date()): { title: string; body: string; tag: string } {
  const title = task.title.trim() || 'Task due';
  const due = taskDueAt(task);
  const day = task.dueDate ? formatDay(task.dueDate, now) : 'soon';
  const clock = due && task.dueTime ? formatClock(due) : 'all day';
  const mins = due ? Math.round((due.getTime() - now.getTime()) / 60_000) : 0;
  const lines = [
    `${leadIn(mins, day)} · task due ${day} · ${clock}`,
    task.description?.trim() ? task.description.trim().slice(0, 140) : 'A gentle nudge from Personal Hub — you’ve got this.',
  ];
  return {
    title: `⏰ ${title}`,
    body: lines.join('\n'),
    tag: `hub-task-reminder-${task.id}@${task.dueDate ?? ''}${task.dueTime ? `T${task.dueTime}` : ''}`,
  };
}

export function buildTestReminderCopy(): { title: string; body: string; tag: string } {
  return {
    title: '⏰ Test reminder',
    body: 'Looking good! Notifications are working on this device.\nYou’ll see a cartoon alert when real reminders are due.',
    tag: 'hub-reminder-test',
  };
}

