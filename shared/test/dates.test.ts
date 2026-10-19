import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  dateKeyInTimeZone,
  deadlineUrgency,
  diffDays,
  eachDay,
  endOfMonth,
  isOverdue,
  isValidDateKey,
  isValidTimeZone,
  startOfWeek,
  todayInTimeZone,
} from '../src/index.js';

describe('date keys', () => {
  it('validates real calendar dates only', () => {
    expect(isValidDateKey('2026-02-28')).toBe(true);
    expect(isValidDateKey('2024-02-29')).toBe(true);
    expect(isValidDateKey('2026-02-29')).toBe(false);
    expect(isValidDateKey('2026-13-01')).toBe(false);
    expect(isValidDateKey('2026-1-01')).toBe(false);
    expect(isValidDateKey('not a date')).toBe(false);
    expect(isValidDateKey(20260101)).toBe(false);
  });

  it('does arithmetic across month, year and DST boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-03-07', 2)).toBe('2026-03-09'); // US DST change
    expect(diffDays('2026-11-02', '2026-10-31')).toBe(2);
    expect(eachDay('2026-10-30', '2026-11-02')).toEqual([
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
    ]);
    expect(endOfMonth('2028-02-10')).toBe('2028-02-29');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
  });

  it('computes week starts for Sunday and Monday weeks', () => {
    // 2026-10-16 is a Friday
    expect(startOfWeek('2026-10-16', 1)).toBe('2026-10-12');
    expect(startOfWeek('2026-10-16', 0)).toBe('2026-10-11');
    expect(startOfWeek('2026-10-11', 1)).toBe('2026-10-05'); // Sunday with Monday weeks
  });

  it('resolves "today" in the user timezone, not the server timezone', () => {
    const instant = new Date('2026-10-16T23:30:00Z');
    expect(todayInTimeZone('UTC', instant)).toBe('2026-10-16');
    expect(todayInTimeZone('Asia/Kolkata', instant)).toBe('2026-10-17');
    expect(todayInTimeZone('America/Los_Angeles', instant)).toBe('2026-10-16');
    expect(dateKeyInTimeZone(new Date('2026-10-17T02:00:00Z'), 'America/New_York')).toBe(
      '2026-10-16',
    );
  });

  it('validates IANA timezones', () => {
    expect(isValidTimeZone('Asia/Kolkata')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
  });
});

describe('overdue and urgency', () => {
  const today = '2026-10-16';

  it('marks open tasks with past due dates as overdue', () => {
    expect(isOverdue({ dueDate: '2026-10-15', status: 'TODO' }, today)).toBe(true);
    expect(isOverdue({ dueDate: '2026-10-15', status: 'IN_PROGRESS' }, today)).toBe(true);
  });

  it('never treats completed, due-today or undated tasks as overdue', () => {
    expect(isOverdue({ dueDate: '2026-10-15', status: 'COMPLETED' }, today)).toBe(false);
    expect(isOverdue({ dueDate: today, status: 'TODO' }, today)).toBe(false);
    expect(isOverdue({ dueDate: null, status: 'TODO' }, today)).toBe(false);
  });

  it('classifies deadline urgency', () => {
    expect(deadlineUrgency({ dueDate: '2026-10-10', status: 'TODO' }, today)).toBe('overdue');
    expect(deadlineUrgency({ dueDate: today, status: 'TODO' }, today)).toBe('today');
    expect(deadlineUrgency({ dueDate: '2026-10-17', status: 'TODO' }, today)).toBe('tomorrow');
    expect(deadlineUrgency({ dueDate: '2026-10-19', status: 'TODO' }, today)).toBe('soon');
    expect(deadlineUrgency({ dueDate: '2026-10-25', status: 'TODO' }, today)).toBe('later');
    expect(deadlineUrgency({ dueDate: '2026-10-10', status: 'COMPLETED' }, today)).toBe('none');
  });
});
