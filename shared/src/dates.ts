/**
 * Calendar-date helpers.
 *
 * Tasks and habits are scheduled on *calendar dates*, not instants, so they are
 * represented everywhere as `DateKey` strings ("YYYY-MM-DD"). Arithmetic on
 * them is done in UTC so it is never affected by the host machine's timezone
 * or DST. "Today" is always resolved in the user's configured IANA timezone.
 */
export type DateKey = string;

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const MS_PER_DAY = 86_400_000;

export function isValidDateKey(value: unknown): value is DateKey {
  if (typeof value !== 'string' || !DATE_KEY_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function isValidTime(value: unknown): value is string {
  return typeof value === 'string' && TIME_RE.test(value);
}

export function isValidTimeZone(tz: string): boolean {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** DateKey → Date at 00:00 UTC (the representation Postgres `date` columns use). */
export function dateKeyToUTCDate(key: DateKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Date at 00:00 UTC → DateKey. */
export function utcDateToDateKey(date: Date): DateKey {
  return date.toISOString().slice(0, 10);
}

/** The calendar date an instant falls on in the given timezone. */
export function dateKeyInTimeZone(instant: Date, timeZone: string): DateKey {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function todayInTimeZone(timeZone: string, now: Date = new Date()): DateKey {
  return dateKeyInTimeZone(now, timeZone);
}

/** The wall-clock time an instant shows in a timezone, expressed as a UTC timestamp. */
function wallClockAsUtc(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
}

/**
 * The instant at which a calendar date and wall-clock time ("HH:mm") occur in a timezone,
 * e.g. 2026-10-26 08:00 in Asia/Kolkata → 2026-10-26T02:30:00Z. Handles DST changes; a
 * time skipped by a spring-forward lands just after the gap.
 */
export function zonedTimeToUtc(date: DateKey, time: string, timeZone: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [h, min] = time.split(':').map(Number);
  const wall = Date.UTC(y, m - 1, d, h, min);
  // Guess with the offset at `wall`, then correct once with the offset at the guess.
  const offsetAt = (ms: number) => wallClockAsUtc(new Date(ms), timeZone) - ms;
  const guess = wall - offsetAt(wall);
  return new Date(wall - offsetAt(guess));
}

/** Minutes since midnight of an instant in the given timezone. */
export function minutesInTimeZone(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return h * 60 + m;
}

export function addDays(key: DateKey, days: number): DateKey {
  const d = dateKeyToUTCDate(key);
  d.setUTCDate(d.getUTCDate() + days);
  return utcDateToDateKey(d);
}

export function addMonths(key: DateKey, months: number): DateKey {
  const [y, m, d] = key.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return utcDateToDateKey(target);
}

/** Whole days from `b` to `a` (a − b). */
export function diffDays(a: DateKey, b: DateKey): number {
  return Math.round((dateKeyToUTCDate(a).getTime() - dateKeyToUTCDate(b).getTime()) / MS_PER_DAY);
}

/** 0 = Sunday … 6 = Saturday */
export function dayOfWeek(key: DateKey): number {
  return dateKeyToUTCDate(key).getUTCDay();
}

export function startOfWeek(key: DateKey, weekStartsOn: number): DateKey {
  return addDays(key, -((dayOfWeek(key) - weekStartsOn + 7) % 7));
}

export function endOfWeek(key: DateKey, weekStartsOn: number): DateKey {
  return addDays(startOfWeek(key, weekStartsOn), 6);
}

export function startOfMonth(key: DateKey): DateKey {
  return `${key.slice(0, 7)}-01`;
}

export function endOfMonth(key: DateKey): DateKey {
  const [y, m] = key.split('-').map(Number);
  return utcDateToDateKey(new Date(Date.UTC(y, m, 0)));
}

/** Inclusive list of dates from `from` to `to`. */
export function eachDay(from: DateKey, to: DateKey): DateKey[] {
  const days: DateKey[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  return days;
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export interface OverdueCandidate {
  dueDate: DateKey | null;
  status: string;
}

/**
 * A task is overdue once its due *date* is in the past (in the user's timezone)
 * and it is not completed. Passing the due time never completes a task.
 */
export function isOverdue(task: OverdueCandidate, today: DateKey): boolean {
  return task.status !== 'COMPLETED' && task.dueDate !== null && task.dueDate < today;
}

export type DeadlineUrgency = 'none' | 'overdue' | 'today' | 'tomorrow' | 'soon' | 'later';

/** How close a deadline is, for visual indicators. "soon" = within 3 days. */
export function deadlineUrgency(task: OverdueCandidate, today: DateKey): DeadlineUrgency {
  if (!task.dueDate || task.status === 'COMPLETED') return 'none';
  const days = diffDays(task.dueDate, today);
  if (days < 0) return 'overdue';
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days <= 3) return 'soon';
  return 'later';
}
