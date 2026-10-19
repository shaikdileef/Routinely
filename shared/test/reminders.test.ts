import { describe, expect, it } from 'vitest';
import {
  describeReminder,
  habitDayHistory,
  phoneSchema,
  reminderSendAt,
  settingsUpdateSchema,
  taskRemindersSchema,
  zonedTimeToUtc,
} from '../src/index.js';

describe('zonedTimeToUtc', () => {
  it('converts a local date and time to the matching instant', () => {
    expect(zonedTimeToUtc('2026-10-26', '08:00', 'Asia/Kolkata').toISOString()).toBe(
      '2026-10-26T02:30:00.000Z',
    );
    expect(zonedTimeToUtc('2026-10-26', '08:00', 'UTC').toISOString()).toBe(
      '2026-10-26T08:00:00.000Z',
    );
  });

  it('follows daylight saving time', () => {
    // New York is UTC-4 in summer and UTC-5 in winter (clocks change on 2026-11-01).
    expect(zonedTimeToUtc('2026-10-31', '08:00', 'America/New_York').toISOString()).toBe(
      '2026-10-31T12:00:00.000Z',
    );
    expect(zonedTimeToUtc('2026-11-02', '08:00', 'America/New_York').toISOString()).toBe(
      '2026-11-02T13:00:00.000Z',
    );
  });
});

describe('reminderSendAt', () => {
  const tz = 'Asia/Kolkata';

  it('schedules relative reminders before the due date at a local time', () => {
    const weekBefore = reminderSendAt(
      { type: 'relative', daysBefore: 7, time: '08:00' },
      '2026-11-09',
      tz,
    );
    expect(weekBefore?.toISOString()).toBe('2026-11-02T02:30:00.000Z');
    const sameDay = reminderSendAt(
      { type: 'relative', daysBefore: 0, time: '18:30' },
      '2026-11-09',
      tz,
    );
    expect(sameDay?.toISOString()).toBe('2026-11-09T13:00:00.000Z');
  });

  it('cannot schedule a relative reminder without a due date', () => {
    expect(reminderSendAt({ type: 'relative', daysBefore: 1, time: '08:00' }, null, tz)).toBeNull();
  });

  it('schedules custom reminders at their own date and time', () => {
    const at = reminderSendAt({ type: 'custom', date: '2026-12-24', time: '20:00' }, null, tz);
    expect(at?.toISOString()).toBe('2026-12-24T14:30:00.000Z');
  });

  it('describes reminders in plain words', () => {
    expect(describeReminder({ type: 'relative', daysBefore: 7, time: '08:00' })).toBe(
      '1 week before at 08:00',
    );
    expect(describeReminder({ type: 'relative', daysBefore: 1, time: '08:00' })).toBe(
      '1 day before at 08:00',
    );
    expect(describeReminder({ type: 'relative', daysBefore: 0, time: '08:00' })).toBe(
      'On the day at 08:00',
    );
    expect(describeReminder({ type: 'custom', date: '2026-12-24', time: '20:00' })).toBe(
      'On 2026-12-24 at 20:00',
    );
  });
});

describe('reminder and notification validation', () => {
  it('drops duplicate reminders and rejects bad times', () => {
    const parsed = taskRemindersSchema.parse({
      reminders: [
        { type: 'relative', daysBefore: 1, time: '08:00' },
        { type: 'relative', daysBefore: 1, time: '08:00' },
        { type: 'custom', date: '2026-12-24', time: '20:00' },
      ],
    });
    expect(parsed.reminders).toHaveLength(2);
    expect(
      taskRemindersSchema.safeParse({
        reminders: [{ type: 'relative', daysBefore: 1, time: '25:00' }],
      }).success,
    ).toBe(false);
  });

  it('accepts international phone numbers and normalises spacing', () => {
    expect(phoneSchema.parse('+91 98765 43210')).toBe('+919876543210');
    expect(phoneSchema.safeParse('98765 43210').success).toBe(false);
    expect(settingsUpdateSchema.safeParse({ notifyEmail: 'not-an-email' }).success).toBe(false);
  });
});

describe('habitDayHistory (daily task dots)', () => {
  const base = { startDate: '2026-10-10', today: '2026-10-16' };

  it('marks done, missed, pending today and days before the task existed', () => {
    const days = habitDayHistory(
      { ...base, frequency: 'DAILY', daysOfWeek: [], completions: ['2026-10-14', '2026-10-15'] },
      8,
    );
    expect(days.map((d) => d.date)).toEqual([
      '2026-10-09',
      '2026-10-10',
      '2026-10-11',
      '2026-10-12',
      '2026-10-13',
      '2026-10-14',
      '2026-10-15',
      '2026-10-16',
    ]);
    expect(days.map((d) => d.state)).toEqual([
      'before',
      'missed',
      'missed',
      'missed',
      'missed',
      'done',
      'done',
      'pending',
    ]);
  });

  it('shows unscheduled weekdays as off, and today as done once ticked', () => {
    // Mondays and Wednesdays only; 2026-10-12 is a Monday, 2026-10-14 a Wednesday.
    const days = habitDayHistory(
      {
        startDate: '2026-10-01',
        today: '2026-10-14',
        frequency: 'SPECIFIC_DAYS',
        daysOfWeek: [1, 3],
        completions: ['2026-10-14'],
      },
      3,
    );
    expect(days).toEqual([
      { date: '2026-10-12', state: 'missed' },
      { date: '2026-10-13', state: 'off' },
      { date: '2026-10-14', state: 'done' },
    ]);
  });
});
