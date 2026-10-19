import { describe, expect, it } from 'vitest';
import { habitCreateSchema, taskCreateSchema, taskQuerySchema } from '../src/index.js';

describe('taskCreateSchema', () => {
  it('normalizes input', () => {
    const r = taskCreateSchema.parse({
      title: '  Write report  ',
      description: '   ',
      tags: ['Work', 'work', ' Urgent '],
    });
    expect(r.title).toBe('Write report');
    expect(r.description).toBeNull();
    expect(r.tags).toEqual(['work', 'urgent']);
  });

  it('rejects blank titles, invalid dates and times', () => {
    expect(taskCreateSchema.safeParse({ title: '   ' }).success).toBe(false);
    expect(taskCreateSchema.safeParse({ title: 'x', dueDate: '2026-02-30' }).success).toBe(false);
    expect(taskCreateSchema.safeParse({ title: 'x', startTime: '25:00' }).success).toBe(false);
  });

  it('enforces cross-field timing rules', () => {
    const r = taskCreateSchema.safeParse({
      title: 'x',
      startDate: '2026-10-20',
      dueDate: '2026-10-18',
      startTime: '10:00',
      endTime: '09:00',
    });
    expect(r.success).toBe(false);
    const paths = r.success ? [] : r.error.issues.map((i) => i.path[0]);
    expect(paths).toEqual(expect.arrayContaining(['startDate', 'endTime']));
  });
});

describe('taskQuerySchema', () => {
  it('applies defaults and coerces pagination', () => {
    const q = taskQuerySchema.parse({ page: '2', pageSize: '10' });
    expect(q).toMatchObject({ page: 2, pageSize: 10, view: 'all', sort: 'dueDate' });
  });

  it('rejects unknown filters', () => {
    expect(taskQuerySchema.safeParse({ priority: 'SUPER' }).success).toBe(false);
    expect(taskQuerySchema.safeParse({ pageSize: '100000' }).success).toBe(false);
  });
});

describe('habitCreateSchema', () => {
  it('requires days for specific-day habits', () => {
    expect(
      habitCreateSchema.safeParse({
        name: 'Gym',
        color: '#4f46e5',
        frequency: 'SPECIFIC_DAYS',
        daysOfWeek: [],
      }).success,
    ).toBe(false);
    const ok = habitCreateSchema.parse({
      name: 'Gym',
      color: '#4F46E5',
      frequency: 'SPECIFIC_DAYS',
      daysOfWeek: [5, 1, 1],
    });
    expect(ok.daysOfWeek).toEqual([1, 5]);
    expect(ok.color).toBe('#4f46e5');
  });
});
