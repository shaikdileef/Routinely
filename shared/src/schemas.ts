import { z } from 'zod';
import {
  HABIT_FREQUENCIES,
  LIMITS,
  PRIORITIES,
  TASK_SORTS,
  TASK_STATUSES,
  TASK_VIEWS,
  THEMES,
  COLOR_THEMES,
} from './constants.js';
import { isValidDateKey, isValidTime, isValidTimeZone, timeToMinutes } from './dates.js';
import {
  MAX_REMINDER_DAYS_BEFORE,
  MAX_REMINDERS_PER_TASK,
  REMINDER_CHANNELS,
  reminderKey,
} from './reminders.js';
import type { ApiErrorIssue } from './types.js';

/* ---------- primitives ---------- */

export const dateKeySchema = z
  .string()
  .refine(isValidDateKey, { message: 'Enter a valid date (YYYY-MM-DD)' });

export const timeSchema = z.string().refine(isValidTime, { message: 'Enter a valid time (HH:mm)' });

export const hexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Choose a valid color')
  .transform((v) => v.toLowerCase());

export const idSchema = z.string().uuid('Invalid id');

/** Optional free text: trimmed, empty string becomes null. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Must be ${max} characters or fewer`)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional();

/* ---------- auth & users ---------- */

const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address').max(254);

export const registerSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(LIMITS.userName),
  email: emailSchema,
  password: z
    .string()
    .min(LIMITS.passwordMin, `Password must be at least ${LIMITS.passwordMin} characters`)
    .max(LIMITS.passwordMax),
  timezone: z.string().refine(isValidTimeZone, 'Unknown timezone').optional(),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required').max(LIMITS.passwordMax),
});

export const profileUpdateSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(LIMITS.userName),
});

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required').max(LIMITS.passwordMax),
  newPassword: z
    .string()
    .min(LIMITS.passwordMin, `Password must be at least ${LIMITS.passwordMin} characters`)
    .max(LIMITS.passwordMax),
});

/** International format, e.g. +919876543210 (needed by WhatsApp). */
export const phoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s()-]/g, ''))
  .refine((v) => /^\+[1-9]\d{7,14}$/.test(v), {
    message: 'Enter the number with its country code, e.g. +91 98765 43210',
  });

export const settingsUpdateSchema = z
  .object({
    theme: z.enum(THEMES),
    colorTheme: z.enum(COLOR_THEMES),
    weekStartsOn: z.union([z.literal(0), z.literal(1)]),
    timezone: z.string().refine(isValidTimeZone, 'Unknown timezone'),
    defaultPriority: z.enum(PRIORITIES),
    /** Where reminder emails go; null means the account email. */
    notifyEmail: emailSchema.nullable(),
    notifyPhone: phoneSchema.nullable(),
    emailReminders: z.boolean(),
    whatsappReminders: z.boolean(),
  })
  .partial();

export const notificationTestSchema = z.object({ channel: z.enum(REMINDER_CHANNELS) });

/* ---------- reminders ---------- */

export const reminderSpecSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('relative'),
    daysBefore: z.number().int().min(0).max(MAX_REMINDER_DAYS_BEFORE),
    time: timeSchema,
  }),
  z.object({ type: z.literal('custom'), date: dateKeySchema, time: timeSchema }),
]);

/** Replaces a task's reminders; duplicates are dropped. */
export const taskRemindersSchema = z.object({
  reminders: z
    .array(reminderSpecSchema)
    .max(MAX_REMINDERS_PER_TASK, `At most ${MAX_REMINDERS_PER_TASK} reminders per task`)
    .transform((specs) => [...new Map(specs.map((s) => [reminderKey(s), s])).values()]),
});

/* ---------- tasks ---------- */

export interface TaskTiming {
  dueDate?: string | null;
  startDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
}

/** Cross-field rules, shared by create (client + server) and update (server, after merging). */
export function taskTimingIssues(t: TaskTiming): ApiErrorIssue[] {
  const issues: ApiErrorIssue[] = [];
  if (t.startDate && t.dueDate && t.startDate > t.dueDate) {
    issues.push({ path: 'startDate', message: 'Start date cannot be after the due date' });
  }
  if (t.endTime && !t.startTime) {
    issues.push({ path: 'startTime', message: 'Add a start time when setting an end time' });
  }
  if (t.startTime && t.endTime && timeToMinutes(t.endTime) <= timeToMinutes(t.startTime)) {
    issues.push({ path: 'endTime', message: 'End time must be after the start time' });
  }
  return issues;
}

const tagsSchema = z
  .array(
    z
      .string()
      .trim()
      .toLowerCase()
      .min(1, 'Tags cannot be empty')
      .max(LIMITS.tagLength, `Tags must be ${LIMITS.tagLength} characters or fewer`),
  )
  .max(LIMITS.tagCount, `Use at most ${LIMITS.tagCount} tags`)
  .transform((tags) => [...new Set(tags)]);

const taskFields = {
  title: z
    .string()
    .trim()
    .min(1, 'Title is required')
    .max(LIMITS.title, `Title must be ${LIMITS.title} characters or fewer`),
  description: optionalText(LIMITS.description),
  notes: optionalText(LIMITS.notes),
  dueDate: dateKeySchema.nullable().optional(),
  startDate: dateKeySchema.nullable().optional(),
  startTime: timeSchema.nullable().optional(),
  endTime: timeSchema.nullable().optional(),
  priority: z.enum(PRIORITIES).optional(),
  status: z.enum(TASK_STATUSES).optional(),
  categoryId: idSchema.nullable().optional(),
  tags: tagsSchema.optional(),
  estimatedMinutes: z
    .number()
    .int('Use whole minutes')
    .min(1, 'Must be at least 1 minute')
    .max(LIMITS.maxEstimatedMinutes, 'Must be 24 hours or less')
    .nullable()
    .optional(),
};

export const taskCreateSchema = z
  .object({ ...taskFields, clientRequestId: z.string().uuid().optional() })
  .superRefine((value, ctx) => {
    for (const issue of taskTimingIssues(value)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [issue.path], message: issue.message });
    }
  });

/** Partial update; timing rules are re-checked on the server against the merged record. */
export const taskUpdateSchema = z
  .object(taskFields)
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });

export const taskQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  view: z.enum(TASK_VIEWS).default('all'),
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  categoryId: z.union([idSchema, z.literal('none')]).optional(),
  tag: z.string().trim().toLowerCase().max(LIMITS.tagLength).optional(),
  from: dateKeySchema.optional(),
  to: dateKeySchema.optional(),
  sort: z.enum(TASK_SORTS).default('dueDate'),
  order: z.enum(['asc', 'desc']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(LIMITS.maxPageSize).default(50),
});

/* ---------- categories ---------- */

export const categoryCreateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name is required')
    .max(LIMITS.categoryName, `Name must be ${LIMITS.categoryName} characters or fewer`),
  color: hexColorSchema,
});

export const categoryUpdateSchema = categoryCreateSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });

export const categoryDeleteQuerySchema = z.object({
  /** Category id to move tasks into, or "none" to leave them uncategorized. */
  reassignTo: z.union([idSchema, z.literal('none')]).optional(),
});

/* ---------- habits ---------- */

const habitFields = {
  name: z
    .string()
    .trim()
    .min(1, 'Name is required')
    .max(LIMITS.habitName, `Name must be ${LIMITS.habitName} characters or fewer`),
  description: optionalText(LIMITS.habitDescription),
  color: hexColorSchema,
  frequency: z.enum(HABIT_FREQUENCIES),
  daysOfWeek: z
    .array(z.number().int().min(0).max(6))
    .max(7)
    .transform((days) => [...new Set(days)].sort((a, b) => a - b)),
};

function checkDays(v: { frequency?: string; daysOfWeek?: number[] }, ctx: z.RefinementCtx) {
  if (v.frequency === 'SPECIFIC_DAYS' && (!v.daysOfWeek || v.daysOfWeek.length === 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['daysOfWeek'],
      message: 'Pick at least one day',
    });
  }
}

export const habitCreateSchema = z
  .object({ ...habitFields, daysOfWeek: habitFields.daysOfWeek.default([]) })
  .superRefine(checkDays);

export const habitUpdateSchema = z
  .object(habitFields)
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });

/* ---------- inferred types ---------- */

export type RegisterInput = z.input<typeof registerSchema>;
export type LoginInput = z.input<typeof loginSchema>;
export type ProfileUpdateInput = z.input<typeof profileUpdateSchema>;
export type PasswordChangeInput = z.input<typeof passwordChangeSchema>;
export type SettingsUpdateInput = z.input<typeof settingsUpdateSchema>;
export type TaskRemindersInput = z.input<typeof taskRemindersSchema>;
export type TaskCreateInput = z.input<typeof taskCreateSchema>;
export type TaskUpdateInput = z.input<typeof taskUpdateSchema>;
export type TaskQueryInput = z.input<typeof taskQuerySchema>;
export type TaskQuery = z.output<typeof taskQuerySchema>;
export type CategoryCreateInput = z.input<typeof categoryCreateSchema>;
export type CategoryUpdateInput = z.input<typeof categoryUpdateSchema>;
export type HabitCreateInput = z.input<typeof habitCreateSchema>;
export type HabitUpdateInput = z.input<typeof habitUpdateSchema>;
