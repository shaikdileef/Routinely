import { describe, expect, it } from 'vitest';
import { computeDashboardStats, type Task } from '../src/index.js';

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

const today = '2026-10-16';

describe('computeDashboardStats', () => {
  it('is empty for a new user', () => {
    const s = computeDashboardStats({
      tasks: [],
      today,
      timezone: 'UTC',
      totals: { all: 0, completed: 0 },
    });
    expect(s.todayProgress).toEqual({ total: 0, completed: 0, remaining: 0, percent: 0 });
    expect(s.weekly).toHaveLength(7);
    expect(s.weekly.every((d) => d.completed === 0)).toBe(true);
    expect(s.weekly[6].date).toBe(today);
  });

  it('derives every metric from the task data', () => {
    const tasks = [
      task({
        dueDate: today,
        status: 'COMPLETED',
        completedAt: '2026-10-16T09:00:00Z',
        priority: 'HIGH',
      }),
      task({ dueDate: today, priority: 'URGENT', startTime: '09:00' }),
      task({ dueDate: today, status: 'IN_PROGRESS' }),
      task({ dueDate: '2026-10-12', priority: 'HIGH' }),
      task({ dueDate: '2026-10-14', status: 'COMPLETED', completedAt: '2026-10-14T10:00:00Z' }),
      task({ dueDate: '2026-10-20', priority: 'LOW' }),
      task({ dueDate: '2026-10-18' }),
      task({ dueDate: null }),
    ];
    const s = computeDashboardStats({
      tasks,
      today,
      timezone: 'UTC',
      totals: { all: 12, completed: 6 },
    });

    expect(s.totals).toEqual({ all: 12, completed: 6, open: 6 });
    expect(s.todayProgress).toEqual({ total: 3, completed: 1, remaining: 2, percent: 33 });
    expect(s.overdueCount).toBe(1);
    expect(s.overdueTasks[0].dueDate).toBe('2026-10-12');
    expect(s.upcomingTasks.map((t) => t.dueDate)).toEqual(['2026-10-18', '2026-10-20']);
    expect(s.completedToday).toBe(1);
    expect(s.completedLast7Days).toBe(2);
    expect(s.inProgressCount).toBe(1);
    expect(s.priorityBreakdown).toEqual({ LOW: 1, MEDIUM: 3, HIGH: 1, URGENT: 1 });
    expect(s.weekly.find((d) => d.date === '2026-10-14')?.completed).toBe(1);
    // open tasks first, ordered by time
    expect(s.todayTasks[0].startTime).toBe('09:00');
    expect(s.todayTasks[2].status).toBe('COMPLETED');
  });

  it('splits open tasks into to do, in progress and overdue, counting each once', () => {
    const tasks = [
      task({ status: 'TODO' }),
      task({ status: 'TODO', dueDate: '2026-10-20' }),
      task({ status: 'IN_PROGRESS' }),
      task({ status: 'IN_PROGRESS', dueDate: '2026-10-10' }), // overdue wins
      task({ status: 'TODO', dueDate: '2026-10-01' }),
      task({ status: 'COMPLETED', completedAt: '2026-10-16T09:00:00Z' }),
    ];
    const s = computeDashboardStats({
      tasks,
      today,
      timezone: 'UTC',
      totals: { all: 6, completed: 1 },
    });
    expect(s.openStatus).toEqual({ todo: 2, inProgress: 1, overdue: 2 });
  });

  it('groups open tasks by category, largest first, folding extras into Other', () => {
    const cat = (id: string, name: string) => ({ id, name, color: '#4f46e5' });
    const inCategory = (id: string, name: string, n: number) =>
      Array.from({ length: n }, () => task({ categoryId: id, category: cat(id, name) }));
    const tasks = [
      ...inCategory('a', 'Work', 5),
      ...inCategory('b', 'Home', 3),
      ...inCategory('c', 'Health', 2),
      ...inCategory('d', 'Errands', 2),
      ...inCategory('e', 'Study', 1),
      ...inCategory('f', 'Fun', 1),
      task({}),
      task({}),
      task({ status: 'COMPLETED', categoryId: 'a', category: cat('a', 'Work') }),
    ];
    const s = computeDashboardStats({
      tasks,
      today,
      timezone: 'UTC',
      totals: { all: tasks.length, completed: 1 },
    });
    expect(s.openByCategory.map((c) => [c.name, c.count])).toEqual([
      ['Work', 5],
      ['Home', 3],
      ['Errands', 2], // ties are ordered by name
      ['Health', 2],
      ['Other', 2],
      ['No category', 2],
    ]);
    expect(s.openByCategory.find((c) => c.key === 'other')?.color).toBeNull();
  });

  it('buckets completions by the user timezone', () => {
    // 2026-10-16T20:00Z is already 2026-10-17 in Kolkata
    const tasks = [task({ status: 'COMPLETED', completedAt: '2026-10-16T20:00:00Z' })];
    const s = computeDashboardStats({
      tasks,
      today: '2026-10-17',
      timezone: 'Asia/Kolkata',
      totals: { all: 1, completed: 1 },
    });
    expect(s.completedToday).toBe(1);
  });
});
