import type { CalendarEvent } from '@/types/models';
import { parseDateStr } from '@/utils/dates';
import { expandOccurrences } from '@/utils/recurrence';

export interface Occurrence {
  key: string;
  date: string;
  event: CalendarEvent;
}

/** Merges one-off and recurring event lists (deduped by id) and expands them within a range. */
export function occurrencesInRange(lists: Array<CalendarEvent[] | undefined>, from: string, to: string): Occurrence[] {
  const byId = new Map<string, CalendarEvent>();
  for (const list of lists) for (const e of list ?? []) byId.set(e.id, e);
  const out: Occurrence[] = [];
  for (const event of byId.values()) {
    for (const date of expandOccurrences(event.date, event.recurrence, from, to, 400)) {
      out.push({ key: `${event.id}@${date}`, date, event });
    }
  }
  return out.sort((a, b) => (a.date + (a.event.time ?? '00:00')).localeCompare(b.date + (b.event.time ?? '00:00')));
}

export const ALL_DAY_REMINDER_TIME = '09:00';

export function occurrenceStart(o: Occurrence): Date {
  const d = parseDateStr(o.date);
  const [h, m] = (o.event.time ?? ALL_DAY_REMINDER_TIME).split(':').map(Number);
  d.setHours(h ?? 9, m ?? 0, 0, 0);
  return d;
}

export function reminderTime(o: Occurrence): Date | null {
  if (o.event.reminderMinutes == null) return null;
  return new Date(occurrenceStart(o).getTime() - o.event.reminderMinutes * 60_000);
}

/** Reminders whose time has passed within the last `windowMs` and which have not fired yet. */
export function dueReminders(occurrences: Occurrence[], now: Date, fired: ReadonlySet<string>, windowMs = 6 * 3_600_000): Occurrence[] {
  return occurrences.filter((o) => {
    const at = reminderTime(o);
    if (!at) return false;
    const delta = now.getTime() - at.getTime();
    return delta >= 0 && delta <= windowMs && !fired.has(o.key);
  });
}

export const REMINDER_OPTIONS = [
  { value: 'none', label: 'No reminder' },
  { value: '0', label: 'At start time' },
  { value: '10', label: '10 minutes before' },
  { value: '30', label: '30 minutes before' },
  { value: '60', label: '1 hour before' },
  { value: '1440', label: '1 day before' },
  { value: '10080', label: '1 week before' },
] as const;
