import { describe, expect, it } from 'vitest';
import { computeHabitStats, type HabitStatsInput } from '../src/index.js';

// 2026-10-16 is a Friday.
const base: HabitStatsInput = {
  frequency: 'DAILY',
  daysOfWeek: [],
  startDate: '2026-10-01',
  completions: [],
  today: '2026-10-16',
  weekStartsOn: 1,
};

describe('computeHabitStats', () => {
  it('returns zeros for a habit with no completions', () => {
    const s = computeHabitStats(base);
    expect(s.currentStreak).toBe(0);
    expect(s.longestStreak).toBe(0);
    expect(s.totalCompletions).toBe(0);
  });

  it('counts consecutive daily completions ending today', () => {
    const s = computeHabitStats({
      ...base,
      completions: ['2026-10-14', '2026-10-15', '2026-10-16'],
    });
    expect(s.currentStreak).toBe(3);
    expect(s.completedToday).toBe(true);
  });

  it('does not break the current streak just because today is not done yet', () => {
    const s = computeHabitStats({ ...base, completions: ['2026-10-14', '2026-10-15'] });
    expect(s.currentStreak).toBe(2);
    expect(s.completedToday).toBe(false);
  });

  it('breaks the streak on a missed scheduled day', () => {
    const s = computeHabitStats({
      ...base,
      completions: ['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-15'],
    });
    expect(s.currentStreak).toBe(1);
    expect(s.longestStreak).toBe(4);
  });

  it('uses the schedule, not record count: unscheduled days neither break nor extend', () => {
    // Mon/Wed/Fri habit. Mon 12, Wed 14, Fri 16 done; Tue/Thu are not scheduled.
    const s = computeHabitStats({
      ...base,
      frequency: 'SPECIFIC_DAYS',
      daysOfWeek: [1, 3, 5],
      completions: ['2026-10-09', '2026-10-12', '2026-10-14', '2026-10-16'],
    });
    expect(s.currentStreak).toBe(4);
    expect(s.week).toEqual({ scheduled: 3, completed: 3 });
  });

  it('ignores completions recorded on unscheduled days and in the future', () => {
    const s = computeHabitStats({
      ...base,
      frequency: 'SPECIFIC_DAYS',
      daysOfWeek: [1, 3, 5],
      completions: ['2026-10-13', '2026-10-15', '2026-10-19'],
    });
    expect(s.totalCompletions).toBe(0);
    expect(s.currentStreak).toBe(0);
  });

  it('a missed Wednesday breaks a Mon/Wed/Fri streak', () => {
    const s = computeHabitStats({
      ...base,
      frequency: 'SPECIFIC_DAYS',
      daysOfWeek: [1, 3, 5],
      completions: ['2026-10-09', '2026-10-12', '2026-10-16'],
    });
    expect(s.currentStreak).toBe(1);
    expect(s.longestStreak).toBe(2);
  });

  it('does not count scheduled days before the habit started', () => {
    const s = computeHabitStats({ ...base, startDate: '2026-10-15', completions: ['2026-10-15'] });
    // week of Mon 12 – Sun 18, but only 15..18 are after start
    expect(s.week).toEqual({ scheduled: 4, completed: 1 });
    expect(s.month).toEqual({ scheduled: 17, completed: 1 });
  });

  it('includes backfilled completions before the start date', () => {
    const s = computeHabitStats({
      ...base,
      startDate: '2026-10-16',
      completions: ['2026-10-14', '2026-10-15'],
    });
    expect(s.currentStreak).toBe(2);
    expect(s.longestStreak).toBe(2);
  });
});
