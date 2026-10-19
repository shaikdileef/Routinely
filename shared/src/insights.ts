import { addDays, dateKeyInTimeZone, dayOfWeek, diffDays, eachDay, startOfWeek } from './dates.js';
import type { DateKey } from './dates.js';
import type { DashboardInsights, Task } from './types.js';

/** How many calendar weeks the weekly trend covers, including the current one. */
export const INSIGHT_WEEKS = 8;

export interface InsightsInput {
  /** Must include every task completed since `insightsWindowStart` and every task due this week. */
  tasks: Task[];
  today: DateKey;
  timezone: string;
  weekStartsOn: number;
  /** The user's sign-up date; averages never count days before it. */
  joinedOn: DateKey;
}

/** First day covered by the insights, so callers know which tasks to load. */
export function insightsWindowStart(today: DateKey, weekStartsOn: number): DateKey {
  return addDays(startOfWeek(today, weekStartsOn), -7 * (INSIGHT_WEEKS - 1));
}

const mean = (values: number[]) =>
  values.length === 0 ? null : values.reduce((sum, v) => sum + v, 0) / values.length;

export function computeInsights(input: InsightsInput): DashboardInsights {
  const { tasks, today, timezone, weekStartsOn } = input;
  const currentWeek = startOfWeek(today, weekStartsOn);
  const windowStart = insightsWindowStart(today, weekStartsOn);
  const joinedOn = input.joinedOn > today ? today : input.joinedOn;
  const activeFrom = joinedOn > windowStart ? joinedOn : windowStart;
  const activeDays = diffDays(today, activeFrom) + 1;

  const completed = tasks.flatMap((task) => {
    if (task.status !== 'COMPLETED' || !task.completedAt) return [];
    const day = dateKeyInTimeZone(new Date(task.completedAt), timezone);
    return day >= windowStart && day <= today ? [{ task, day }] : [];
  });

  const perDay = new Map<DateKey, number>();
  for (const { day } of completed) perDay.set(day, (perDay.get(day) ?? 0) + 1);

  const weeks = Array.from({ length: INSIGHT_WEEKS }, (_, i) => {
    const weekStart = addDays(windowStart, i * 7);
    const days = eachDay(weekStart, addDays(weekStart, 6));
    return {
      weekStart,
      completed: days.reduce((sum, d) => sum + (perDay.get(d) ?? 0), 0),
      partial: weekStart === currentWeek,
    };
  });

  const activeRange = eachDay(activeFrom, today);
  const activeTotal = activeRange.reduce((sum, d) => sum + (perDay.get(d) ?? 0), 0);
  const averagePerDay = activeTotal / activeDays;

  const weekdayAverages = Array.from({ length: 7 }, (_, i) => {
    const weekday = (weekStartsOn + i) % 7;
    const days = activeRange.filter((d) => dayOfWeek(d) === weekday);
    const total = days.reduce((sum, d) => sum + (perDay.get(d) ?? 0), 0);
    return { weekday, average: days.length === 0 ? 0 : total / days.length };
  });

  const completionHours = completed.map(
    ({ task }) =>
      (new Date(task.completedAt!).getTime() - new Date(task.createdAt).getTime()) / 3_600_000,
  );

  const withDeadline = completed.filter(({ task }) => task.dueDate !== null);
  const onTime = withDeadline.filter(({ task, day }) => day <= task.dueDate!).length;

  return {
    weeks,
    weeklyAverage: averagePerDay * 7,
    thisWeek: eachDay(currentWeek, addDays(currentWeek, 6)).map((date) => {
      const due = tasks.filter((t) => t.dueDate === date);
      return {
        date,
        planned: due.length,
        done: due.filter((t) => t.status === 'COMPLETED').length,
      };
    }),
    weekdayAverages,
    averagePerDay,
    averageCompletionHours: mean(completionHours.map((h) => Math.max(0, h))),
    onTimeRate: withDeadline.length === 0 ? null : Math.round((onTime / withDeadline.length) * 100),
  };
}
