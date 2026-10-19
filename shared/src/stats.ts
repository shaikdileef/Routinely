import { PRIORITIES, PRIORITY_RANK, type Priority } from './constants.js';
import { addDays, dateKeyInTimeZone, isOverdue, type DateKey } from './dates.js';
import { computeInsights, insightsWindowStart } from './insights.js';
import type { CategorySlice, DashboardStats, Task } from './types.js';

export interface DashboardInput {
  /**
   * Must include every open task, every task due this week, and every task completed
   * since `insightsWindowStart(today, weekStartsOn)`.
   */
  tasks: Task[];
  today: DateKey;
  timezone: string;
  totals: { all: number; completed: number };
  /** 0 = Sunday, 1 = Monday (default). */
  weekStartsOn?: number;
  /** The user's sign-up date; defaults to the start of the insights window. */
  joinedOn?: DateKey;
  listLimit?: number;
}

const byDueThenPriority = (a: Task, b: Task) =>
  (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') ||
  PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] ||
  (a.startTime ?? '99').localeCompare(b.startTime ?? '99');

/** At most this many named categories get their own slice; the rest become "Other". */
export const MAX_CATEGORY_SLICES = 4;

/**
 * Open tasks per category, largest first: the top categories by name, then "Other" for the
 * rest and "No category" for uncategorised tasks, so a chart never has too many slices.
 */
function categorySlices(open: Task[]): CategorySlice[] {
  const byCategory = new Map<string, CategorySlice>();
  let uncategorised = 0;
  for (const t of open) {
    if (!t.category) {
      uncategorised += 1;
      continue;
    }
    const slice = byCategory.get(t.category.id) ?? {
      key: t.category.id,
      name: t.category.name,
      color: t.category.color,
      count: 0,
    };
    slice.count += 1;
    byCategory.set(t.category.id, slice);
  }

  const ranked = [...byCategory.values()].sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name),
  );
  const slices = ranked.slice(0, MAX_CATEGORY_SLICES);
  const rest = ranked.slice(MAX_CATEGORY_SLICES).reduce((sum, s) => sum + s.count, 0);
  if (rest > 0) slices.push({ key: 'other', name: 'Other', color: null, count: rest });
  if (uncategorised > 0) {
    slices.push({ key: 'none', name: 'No category', color: null, count: uncategorised });
  }
  return slices;
}

export function computeDashboardStats(input: DashboardInput): DashboardStats {
  const { tasks, today, timezone, weekStartsOn = 1, listLimit = 5 } = input;
  const weekStart = addDays(today, -6);

  const completedOn = (t: Task): DateKey | null =>
    t.status === 'COMPLETED' && t.completedAt
      ? dateKeyInTimeZone(new Date(t.completedAt), timezone)
      : null;

  const open = tasks.filter((t) => t.status !== 'COMPLETED');
  const dueToday = tasks.filter((t) => t.dueDate === today);
  const dueTodayCompleted = dueToday.filter((t) => t.status === 'COMPLETED').length;
  const overdue = open.filter((t) => isOverdue(t, today)).sort(byDueThenPriority);
  const upcoming = open
    .filter((t) => t.dueDate !== null && t.dueDate > today)
    .sort(byDueThenPriority);

  const weekly = Array.from({ length: 7 }, (_, i) => ({
    date: addDays(weekStart, i),
    completed: 0,
  }));
  let completedToday = 0;
  for (const t of tasks) {
    const day = completedOn(t);
    if (!day) continue;
    if (day === today) completedToday += 1;
    const bucket = weekly.find((w) => w.date === day);
    if (bucket) bucket.completed += 1;
  }

  const priorityBreakdown = Object.fromEntries(PRIORITIES.map((p) => [p, 0])) as Record<
    Priority,
    number
  >;
  for (const t of open) priorityBreakdown[t.priority] += 1;

  // Overdue wins over in-progress, so every open task is counted exactly once.
  const overdueIds = new Set(overdue.map((t) => t.id));
  const openStatus = {
    todo: open.filter((t) => !overdueIds.has(t.id) && t.status === 'TODO').length,
    inProgress: open.filter((t) => !overdueIds.has(t.id) && t.status === 'IN_PROGRESS').length,
    overdue: overdue.length,
  };

  return {
    today,
    insights: computeInsights({
      tasks,
      today,
      timezone,
      weekStartsOn,
      joinedOn: input.joinedOn ?? insightsWindowStart(today, weekStartsOn),
    }),
    totals: {
      all: input.totals.all,
      completed: input.totals.completed,
      open: input.totals.all - input.totals.completed,
    },
    todayProgress: {
      total: dueToday.length,
      completed: dueTodayCompleted,
      remaining: dueToday.length - dueTodayCompleted,
      percent: dueToday.length === 0 ? 0 : Math.round((dueTodayCompleted / dueToday.length) * 100),
    },
    overdueCount: overdue.length,
    completedToday,
    completedLast7Days: weekly.reduce((sum, w) => sum + w.completed, 0),
    inProgressCount: open.filter((t) => t.status === 'IN_PROGRESS').length,
    priorityBreakdown,
    openStatus,
    openByCategory: categorySlices(open),
    weekly,
    todayTasks: [...dueToday].sort(
      (a, b) =>
        Number(a.status === 'COMPLETED') - Number(b.status === 'COMPLETED') ||
        (a.startTime ?? '99').localeCompare(b.startTime ?? '99') ||
        PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority],
    ),
    overdueTasks: overdue.slice(0, listLimit),
    upcomingTasks: upcoming.slice(0, listLimit),
  };
}
