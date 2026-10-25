import { describe, expect, it } from 'vitest';
import { addDays, addMonths, describeDue, diffDays, isValidDateStr, monthGrid, toDateStr } from '@/utils/dates';
import { advance, describeRecurrence, expandOccurrences, nextOccurrence } from '@/utils/recurrence';

describe('date helpers', () => {
  it('validates calendar dates', () => {
    expect(isValidDateStr('2024-02-29')).toBe(true);
    expect(isValidDateStr('2023-02-29')).toBe(false);
    expect(isValidDateStr('2024-13-01')).toBe(false);
    expect(isValidDateStr('24-01-01')).toBe(false);
  });

  it('adds days and months with clamping', () => {
    expect(addDays('2024-12-31', 1)).toBe('2025-01-01');
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonths('2023-01-31', 1)).toBe('2023-02-28');
    expect(addMonths('2024-03-15', -3)).toBe('2023-12-15');
    expect(diffDays('2024-03-01', '2024-02-28')).toBe(2);
  });

  it('builds a 6-week month grid honouring week start', () => {
    const mon = monthGrid(2024, 1, 1); // Feb 2024 starts on Thursday
    expect(mon).toHaveLength(42);
    expect(mon[0]).toBe('2024-01-29');
    const sun = monthGrid(2024, 1, 0);
    expect(sun[0]).toBe('2024-01-28');
  });

  it('describes due dates', () => {
    expect(describeDue('2024-05-09', '2024-05-10').tone).toBe('overdue');
    expect(describeDue('2024-05-10', '2024-05-10').label).toBe('Today');
    expect(describeDue('2024-05-11', '2024-05-10').label).toBe('Tomorrow');
  });

  it('formats local dates without timezone drift', () => {
    expect(toDateStr(new Date(2024, 0, 5, 23, 59))).toBe('2024-01-05');
  });
});

describe('recurrence', () => {
  it('expands daily and weekly series within a range', () => {
    expect(expandOccurrences('2024-01-01', { freq: 'daily', interval: 2 }, '2024-01-04', '2024-01-10')).toEqual([
      '2024-01-05',
      '2024-01-07',
      '2024-01-09',
    ]);
    expect(expandOccurrences('2024-01-01', { freq: 'weekly', interval: 1 }, '2024-01-01', '2024-01-22')).toEqual([
      '2024-01-01',
      '2024-01-08',
      '2024-01-15',
      '2024-01-22',
    ]);
  });

  it('keeps the original day for monthly series, clamped in short months', () => {
    expect(expandOccurrences('2024-01-31', { freq: 'monthly', interval: 1 }, '2024-01-01', '2024-04-30')).toEqual([
      '2024-01-31',
      '2024-02-29',
      '2024-03-31',
      '2024-04-30',
    ]);
  });

  it('handles yearly series such as birthdays far in the past', () => {
    expect(expandOccurrences('1990-06-15', { freq: 'yearly', interval: 1 }, '2024-06-01', '2024-06-30')).toEqual(['2024-06-15']);
    expect(expandOccurrences('2020-02-29', { freq: 'yearly', interval: 1 }, '2023-02-01', '2023-03-01')).toEqual(['2023-02-28']);
  });

  it('returns one-off events only inside the range', () => {
    expect(expandOccurrences('2024-05-05', { freq: 'none', interval: 1 }, '2024-05-01', '2024-05-31')).toEqual(['2024-05-05']);
    expect(expandOccurrences('2024-06-05', { freq: 'none', interval: 1 }, '2024-05-01', '2024-05-31')).toEqual([]);
  });

  it('advances and finds next occurrences', () => {
    expect(advance('2024-01-31', { freq: 'monthly', interval: 1 })).toBe('2024-02-29');
    expect(advance('2024-01-01', { freq: 'weekly', interval: 2 })).toBe('2024-01-15');
    expect(advance('2024-01-01', { freq: 'none', interval: 1 })).toBeNull();
    expect(nextOccurrence('2024-01-01', { freq: 'weekly', interval: 1 }, '2024-01-10')).toBe('2024-01-15');
    expect(describeRecurrence({ freq: 'monthly', interval: 3 })).toBe('Every 3 months');
  });
});
