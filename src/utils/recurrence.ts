import type { Recurrence } from '@/types/models';
import { addDays, addMonths, compareDateStr, diffDays, parseDateStr } from './dates';

export const NO_RECURRENCE: Recurrence = { freq: 'none', interval: 1 };

/** Next occurrence strictly after `from`, anchored on the series start date. */
export function nextOccurrence(start: string, rec: Recurrence, from: string): string | null {
  if (rec.freq === 'none') return null;
  if (compareDateStr(from, start) < 0) return start;
  const occurrences = expandOccurrences(start, rec, addDays(from, 1), addDays(from, 400 * rec.interval), 1);
  return occurrences[0] ?? null;
}

/** Advances a single date by one recurrence step (used when completing a recurring task). */
export function advance(date: string, rec: Recurrence): string | null {
  switch (rec.freq) {
    case 'none':
      return null;
    case 'daily':
      return addDays(date, rec.interval);
    case 'weekly':
      return addDays(date, 7 * rec.interval);
    case 'monthly':
      return addMonths(date, rec.interval);
    case 'yearly':
      return addMonths(date, 12 * rec.interval);
  }
}

/**
 * Lists occurrence dates of a series within [rangeStart, rangeEnd] (inclusive).
 * Monthly/yearly series keep the original day-of-month, clamped to short months.
 */
export function expandOccurrences(
  start: string,
  rec: Recurrence,
  rangeStart: string,
  rangeEnd: string,
  max = 500,
): string[] {
  if (compareDateStr(rangeEnd, rangeStart) < 0) return [];
  if (rec.freq === 'none') {
    return compareDateStr(start, rangeStart) >= 0 && compareDateStr(start, rangeEnd) <= 0 ? [start] : [];
  }
  const out: string[] = [];
  const interval = Math.max(1, rec.interval);

  if (rec.freq === 'daily' || rec.freq === 'weekly') {
    const step = rec.freq === 'daily' ? interval : interval * 7;
    let k = 0;
    if (compareDateStr(rangeStart, start) > 0) k = Math.ceil(diffDays(rangeStart, start) / step);
    for (let date = addDays(start, k * step); compareDateStr(date, rangeEnd) <= 0 && out.length < max; date = addDays(date, step)) {
      out.push(date);
    }
    return out;
  }

  const monthStep = rec.freq === 'monthly' ? interval : interval * 12;
  const anchorDay = parseDateStr(start).getDate();
  const s = parseDateStr(start);
  const rs = parseDateStr(rangeStart);
  let k = 0;
  if (rs > s) {
    const monthsBetween = (rs.getFullYear() - s.getFullYear()) * 12 + (rs.getMonth() - s.getMonth());
    k = Math.max(0, Math.floor(monthsBetween / monthStep) - 1);
  }
  for (let guard = 0; guard < 10_000 && out.length < max; guard++, k++) {
    const date = addMonths(start, k * monthStep, anchorDay);
    if (compareDateStr(date, rangeEnd) > 0) break;
    if (compareDateStr(date, rangeStart) >= 0) out.push(date);
  }
  return out;
}

export function describeRecurrence(rec: Recurrence): string {
  if (rec.freq === 'none') return 'Does not repeat';
  const unit = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }[rec.freq];
  return rec.interval === 1 ? `Every ${unit}` : `Every ${rec.interval} ${unit}s`;
}
