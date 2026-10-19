import type { HabitFrequency } from './constants.js';
import {
  addDays,
  dayOfWeek,
  endOfMonth,
  endOfWeek,
  startOfMonth,
  startOfWeek,
  type DateKey,
} from './dates.js';
import type { HabitStats } from './types.js';

export interface HabitSchedule {
  frequency: HabitFrequency;
  daysOfWeek: number[];
}

export function isScheduledOn(schedule: HabitSchedule, date: DateKey): boolean {
  return schedule.frequency === 'DAILY' || schedule.daysOfWeek.includes(dayOfWeek(date));
}

/**
 * One day in a daily task's history: `done` / `missed` on scheduled days, `pending` for
 * today until it's ticked, `off` when it isn't scheduled, `before` the task existed.
 */
export type HabitDayState = 'done' | 'missed' | 'pending' | 'off' | 'before';

export interface HabitDay {
  date: DateKey;
  state: HabitDayState;
}

export interface HabitHistoryInput extends HabitSchedule {
  startDate: DateKey;
  completions: DateKey[];
  today: DateKey;
}

/** The last `days` days, oldest first and ending today, for a row of history dots. */
export function habitDayHistory(input: HabitHistoryInput, days = 30): HabitDay[] {
  const done = new Set(input.completions);
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(input.today, i - (days - 1));
    let state: HabitDayState;
    if (done.has(date) && isScheduledOn(input, date)) state = 'done';
    else if (date < input.startDate) state = 'before';
    else if (!isScheduledOn(input, date)) state = 'off';
    else state = date === input.today ? 'pending' : 'missed';
    return { date, state };
  });
}

export interface HabitStatsInput extends HabitSchedule {
  startDate: DateKey;
  completions: DateKey[];
  today: DateKey;
  weekStartsOn: number;
}

/**
 * Streaks count consecutive *scheduled* days that were completed. Days the habit
 * is not scheduled on neither extend nor break a streak, and today does not break
 * the current streak until the day is over.
 */
export function computeHabitStats(input: HabitStatsInput): HabitStats {
  const { today, weekStartsOn } = input;
  const done = new Set(input.completions.filter((d) => d <= today && isScheduledOn(input, d)));
  const earliestCompletion = [...done].sort()[0];
  const first =
    earliestCompletion && earliestCompletion < input.startDate
      ? earliestCompletion
      : input.startDate;

  let longestStreak = 0;
  let run = 0;
  for (let d = first; d <= today; d = addDays(d, 1)) {
    if (!isScheduledOn(input, d)) continue;
    if (done.has(d)) {
      run += 1;
      longestStreak = Math.max(longestStreak, run);
    } else if (d !== today) {
      run = 0;
    }
  }

  let currentStreak = 0;
  for (let d = today; d >= first; d = addDays(d, -1)) {
    if (!isScheduledOn(input, d)) continue;
    if (done.has(d)) currentStreak += 1;
    else if (d === today) continue;
    else break;
  }

  const countRange = (from: DateKey, to: DateKey) => {
    let scheduled = 0;
    let completed = 0;
    for (let d = from < first ? first : from; d <= to; d = addDays(d, 1)) {
      if (!isScheduledOn(input, d)) continue;
      scheduled += 1;
      if (done.has(d)) completed += 1;
    }
    return { scheduled, completed };
  };

  return {
    currentStreak,
    longestStreak,
    scheduledToday: isScheduledOn(input, today),
    completedToday: done.has(today),
    week: countRange(startOfWeek(today, weekStartsOn), endOfWeek(today, weekStartsOn)),
    month: countRange(startOfMonth(today), endOfMonth(today)),
    totalCompletions: done.size,
  };
}
