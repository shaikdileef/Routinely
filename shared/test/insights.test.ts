import { describe, expect, it } from 'vitest';
import { computeInsights, insightsWindowStart, type Task } from '../src/index.js';

let seq = 0;
function task(overrides: Partial<Task>): Task {
  seq += 1;
  return {
    id: `t${seq}`,
    title: `Task ${seq}`,
    description: null,
    notes: null,
    dueDate: null,
    startDate: null,
    startTime: null,
    endTime: null,
    priority: 'MEDIUM',
    status: 'TODO',
    categoryId: null,
    category: null,
    tags: [],
    estimatedMinutes: null,
    images: { before: null, after: null },
    completedAt: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

const done = (completedAt: string, extra: Partial<Task> = {}) =>
  task({ status: 'COMPLETED', completedAt, ...extra });

// Friday; with Monday-start weeks the current week is 2026-10-12 … 2026-10-18.
const today = '2026-10-16';
const base = { today, timezone: 'UTC', weekStartsOn: 1 };

describe('computeInsights', () => {
  it('covers 8 calendar weeks ending with the current one', () => {
    expect(insightsWindowStart(today, 1)).toBe('2026-08-24');
    const s = computeInsights({ ...base, tasks: [], joinedOn: today });
    expect(s.weeks).toHaveLength(8);
    expect(s.weeks[0].weekStart).toBe('2026-08-24');
    expect(s.weeks[7]).toEqual({ weekStart: '2026-10-12', completed: 0, partial: true });
    expect(s.weeks.slice(0, 7).every((w) => !w.partial)).toBe(true);
  });

  it('reports zero averages and null ratios for a brand-new user', () => {
    const s = computeInsights({ ...base, tasks: [], joinedOn: today });
    expect(s.averagePerDay).toBe(0);
    expect(s.weeklyAverage).toBe(0);
    expect(s.averageCompletionHours).toBeNull();
    expect(s.onTimeRate).toBeNull();
  });

  it('averages only over the days since the user joined', () => {
    // Joined Wednesday: 3 active days (Wed, Thu, Fri) with 6 completions.
    const tasks = [
      done('2026-10-14T09:00:00Z'),
      done('2026-10-14T10:00:00Z'),
      done('2026-10-15T09:00:00Z'),
      done('2026-10-16T09:00:00Z'),
      done('2026-10-16T10:00:00Z'),
      done('2026-10-16T11:00:00Z'),
    ];
    const s = computeInsights({ ...base, tasks, joinedOn: '2026-10-14' });
    expect(s.averagePerDay).toBe(2);
    expect(s.weeklyAverage).toBe(14);
    expect(s.weeks[7].completed).toBe(6);
  });

  it('averages each weekday over the times it has occurred, starting from the week start', () => {
    // Joined two weeks ago on Friday 2026-10-02: Fridays seen = 10-02, 10-09, 10-16.
    const tasks = [
      done('2026-10-02T09:00:00Z'),
      done('2026-10-09T09:00:00Z'),
      done('2026-10-09T10:00:00Z'),
      done('2026-10-06T09:00:00Z'), // a Tuesday
    ];
    const s = computeInsights({ ...base, tasks, joinedOn: '2026-10-02' });
    expect(s.weekdayAverages.map((w) => w.weekday)).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(s.weekdayAverages.find((w) => w.weekday === 5)?.average).toBe(1);
    expect(s.weekdayAverages.find((w) => w.weekday === 2)?.average).toBe(0.5);
  });

  it('measures completion time and on-time rate', () => {
    const tasks = [
      done('2026-10-15T12:00:00Z', { createdAt: '2026-10-15T00:00:00Z', dueDate: '2026-10-15' }),
      done('2026-10-16T12:00:00Z', { createdAt: '2026-10-14T12:00:00Z', dueDate: '2026-10-15' }),
      done('2026-10-16T06:00:00Z', { createdAt: '2026-10-16T00:00:00Z' }),
    ];
    const s = computeInsights({ ...base, tasks, joinedOn: '2026-10-01' });
    expect(s.averageCompletionHours).toBe((12 + 48 + 6) / 3);
    expect(s.onTimeRate).toBe(50);
  });

  it('shows planned versus done for every day of the current week', () => {
    const tasks = [
      task({ dueDate: '2026-10-13' }),
      done('2026-10-13T09:00:00Z', { dueDate: '2026-10-13' }),
      task({ dueDate: '2026-10-18', status: 'IN_PROGRESS' }),
      task({ dueDate: '2026-10-19' }), // next week
    ];
    const s = computeInsights({ ...base, tasks, joinedOn: '2026-10-01' });
    expect(s.thisWeek.map((d) => d.date)).toEqual([
      '2026-10-12',
      '2026-10-13',
      '2026-10-14',
      '2026-10-15',
      '2026-10-16',
      '2026-10-17',
      '2026-10-18',
    ]);
    expect(s.thisWeek[1]).toEqual({ date: '2026-10-13', planned: 2, done: 1 });
    expect(s.thisWeek[6]).toEqual({ date: '2026-10-18', planned: 1, done: 0 });
  });

  it('respects Sunday-start weeks and the user timezone', () => {
    // 2026-10-10T20:00Z is already Sunday 2026-10-11 in Kolkata, the first day of this week.
    const tasks = [done('2026-10-10T20:00:00Z')];
    const s = computeInsights({
      ...base,
      tasks,
      timezone: 'Asia/Kolkata',
      weekStartsOn: 0,
      joinedOn: '2026-10-01',
    });
    expect(s.weeks[7]).toEqual({ weekStart: '2026-10-11', completed: 1, partial: true });
    expect(s.weekdayAverages[0].weekday).toBe(0);
  });
});
