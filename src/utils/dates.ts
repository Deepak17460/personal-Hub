/**
 * Calendar dates are stored as local "YYYY-MM-DD" strings so that a due date
 * means the same day on every device regardless of timezone.
 */
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidDateStr(value: string): boolean {
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d;
}

export function parseDateStr(value: string): Date {
  const m = DATE_RE.exec(value);
  if (!m) throw new Error(`Invalid date string: ${value}`);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function toDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayStr(now: Date = new Date()): string {
  return toDateStr(now);
}

export function addDays(value: string, days: number): string {
  const d = parseDateStr(value);
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/** Adds months, clamping to the last day of the target month (Jan 31 + 1 month = Feb 28/29). */
export function addMonths(value: string, months: number, anchorDay?: number): string {
  const d = parseDateStr(value);
  const day = anchorDay ?? d.getDate();
  const target = new Date(d.getFullYear(), d.getMonth() + months, 1);
  const clamped = Math.min(day, daysInMonth(target.getFullYear(), target.getMonth()));
  return toDateStr(new Date(target.getFullYear(), target.getMonth(), clamped));
}

export function compareDateStr(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function diffDays(a: string, b: string): number {
  const ms = parseDateStr(a).getTime() - parseDateStr(b).getTime();
  return Math.round(ms / 86_400_000);
}

export function monthGrid(year: number, monthIndex: number, weekStartsOn: 0 | 1): string[] {
  const first = new Date(year, monthIndex, 1);
  const offset = (first.getDay() - weekStartsOn + 7) % 7;
  const start = new Date(year, monthIndex, 1 - offset);
  const cells: string[] = [];
  for (let i = 0; i < 42; i++) {
    cells.push(toDateStr(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)));
  }
  return cells;
}

export function formatDateStr(value: string, opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }): string {
  return new Intl.DateTimeFormat(undefined, opts).format(parseDateStr(value));
}

export function formatRelative(date: Date, now: Date = new Date()): string {
  const diffSec = Math.round((date.getTime() - now.getTime()) / 1000);
  const abs = Math.abs(diffSec);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  if (abs < 45) return 'just now';
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute');
  if (abs < 86_400) return rtf.format(Math.round(diffSec / 3600), 'hour');
  if (abs < 86_400 * 7) return rtf.format(Math.round(diffSec / 86_400), 'day');
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
}

export function describeDue(due: string, today: string = todayStr()): { label: string; tone: 'overdue' | 'today' | 'soon' | 'later' } {
  const diff = diffDays(due, today);
  if (diff < 0) return { label: diff === -1 ? 'Yesterday' : `${-diff} days overdue`, tone: 'overdue' };
  if (diff === 0) return { label: 'Today', tone: 'today' };
  if (diff === 1) return { label: 'Tomorrow', tone: 'soon' };
  if (diff < 7) return { label: formatDateStr(due, { weekday: 'long' }), tone: 'soon' };
  return { label: formatDateStr(due), tone: 'later' };
}
