import { addDays, zonedTimeToUtc, type DateKey } from './dates.js';

/** How reminders are delivered. */
export const REMINDER_CHANNELS = ['EMAIL', 'WHATSAPP'] as const;
export type ReminderChannel = (typeof REMINDER_CHANNELS)[number];

export const REMINDER_STATUSES = ['PENDING', 'SENDING', 'SENT', 'FAILED', 'CANCELLED'] as const;
export type ReminderStatus = (typeof REMINDER_STATUSES)[number];

/** Reminders found more than this late (e.g. the server was off) are marked missed, not sent. */
export const REMINDER_LATE_LIMIT_MS = 12 * 60 * 60 * 1000;
export const DEFAULT_REMINDER_TIME = '08:00';
export const MAX_REMINDERS_PER_TASK = 10;
/** Furthest ahead of the due date a relative reminder can be. */
export const MAX_REMINDER_DAYS_BEFORE = 60;

/**
 * When to remind about a task: a number of days before its due date at a local time, or a
 * custom local date and time. Times are in the user's timezone.
 */
export type ReminderSpec =
  | { type: 'relative'; daysBefore: number; time: string }
  | { type: 'custom'; date: DateKey; time: string };

export const REMINDER_PRESETS: { label: string; spec: ReminderSpec }[] = [
  {
    label: '1 week before',
    spec: { type: 'relative', daysBefore: 7, time: DEFAULT_REMINDER_TIME },
  },
  { label: '1 day before', spec: { type: 'relative', daysBefore: 1, time: DEFAULT_REMINDER_TIME } },
  { label: 'On the day', spec: { type: 'relative', daysBefore: 0, time: DEFAULT_REMINDER_TIME } },
];

/** A stable identity for a spec, used to de-duplicate and compare reminders. */
export function reminderKey(spec: ReminderSpec): string {
  return spec.type === 'relative'
    ? `relative:${spec.daysBefore}:${spec.time}`
    : `custom:${spec.date}:${spec.time}`;
}

/**
 * The instant a reminder should be sent, or null when it can't be scheduled (a relative
 * reminder on a task without a due date).
 */
export function reminderSendAt(
  spec: ReminderSpec,
  dueDate: DateKey | null,
  timeZone: string,
): Date | null {
  if (spec.type === 'custom') return zonedTimeToUtc(spec.date, spec.time, timeZone);
  if (!dueDate) return null;
  return zonedTimeToUtc(addDays(dueDate, -spec.daysBefore), spec.time, timeZone);
}

/** Human description, e.g. "1 day before at 08:00" or "On 2026-11-02 at 18:30". */
export function describeReminder(spec: ReminderSpec): string {
  if (spec.type === 'custom') return `On ${spec.date} at ${spec.time}`;
  if (spec.daysBefore === 0) return `On the day at ${spec.time}`;
  if (spec.daysBefore === 7) return `1 week before at ${spec.time}`;
  const days = spec.daysBefore === 1 ? '1 day' : `${spec.daysBefore} days`;
  return `${days} before at ${spec.time}`;
}
