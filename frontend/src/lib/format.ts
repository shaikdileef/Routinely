import { dateKeyInTimeZone, dateKeyToUTCDate, diffDays, type DateKey } from '@planner/shared';

// DateKeys are formatted in UTC so the displayed calendar date never shifts.
const fmt = (opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(undefined, { ...opts, timeZone: 'UTC' });

const formatters = {
  short: fmt({ month: 'short', day: 'numeric' }),
  shortWithYear: fmt({ month: 'short', day: 'numeric', year: 'numeric' }),
  weekdayShort: fmt({ weekday: 'short', month: 'short', day: 'numeric' }),
  long: fmt({ weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
  weekday: fmt({ weekday: 'long' }),
  weekdayNarrow: fmt({ weekday: 'short' }),
  monthYear: fmt({ month: 'long', year: 'numeric' }),
  dayNumber: fmt({ day: 'numeric' }),
};

export type DateStyle = keyof typeof formatters;

export function formatDate(key: DateKey, style: DateStyle = 'short'): string {
  return formatters[style].format(dateKeyToUTCDate(key));
}

/** "Today", "Tomorrow", "Yesterday", weekday within a week, else a short date. */
export function relativeDay(key: DateKey, today: DateKey): string {
  const d = diffDays(key, today);
  if (d === 0) return 'Today';
  if (d === 1) return 'Tomorrow';
  if (d === -1) return 'Yesterday';
  if (d > 1 && d < 7) return formatDate(key, 'weekday');
  return formatDate(key, key.slice(0, 4) === today.slice(0, 4) ? 'short' : 'shortWithYear');
}

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'UTC',
});

export function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  return timeFormatter.format(new Date(Date.UTC(1970, 0, 1, h, m)));
}

export function formatTimeRange(start: string | null, end: string | null): string | null {
  if (!start) return null;
  return end ? `${formatTime(start)} – ${formatTime(end)}` : formatTime(start);
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** Completion timestamps are instants; show them on the user's calendar. */
export function formatInstantDate(iso: string, timeZone: string, today: DateKey): string {
  return relativeDay(dateKeyInTimeZone(new Date(iso), timeZone), today);
}

export function greeting(minutesSinceMidnight: number): string {
  const h = minutesSinceMidnight / 60;
  if (h < 5) return 'Good evening';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function pluralize(n: number, word: string, plural = `${word}s`) {
  return `${n} ${n === 1 ? word : plural}`;
}
