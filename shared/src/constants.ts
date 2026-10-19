export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'COMPLETED'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const THEMES = ['LIGHT', 'DARK', 'SYSTEM'] as const;
export type Theme = (typeof THEMES)[number];

/** Colour themes (accent and ambient light). They work with both light and dark mode. */
export const COLOR_THEMES = ['LAVENDER', 'OCEAN', 'SUNSET', 'FOREST', 'ROSE', 'AURORA'] as const;
export type ColorTheme = (typeof COLOR_THEMES)[number];

export const HABIT_FREQUENCIES = ['DAILY', 'SPECIFIC_DAYS'] as const;
export type HabitFrequency = (typeof HABIT_FREQUENCIES)[number];

/** Date-based task views understood by GET /api/tasks?view=… */
export const TASK_VIEWS = [
  'all',
  'open',
  'today',
  'upcoming',
  'overdue',
  'completed',
  'nodate',
] as const;
export type TaskView = (typeof TASK_VIEWS)[number];

/** A task's optional pictures: `before` shows while it is open, `after` once it is completed. */
export const TASK_IMAGE_KINDS = ['before', 'after'] as const;
export type TaskImageKind = (typeof TASK_IMAGE_KINDS)[number];

/** A user's own images (currently just their profile photo). */
export const USER_IMAGE_KINDS = ['avatar'] as const;
export type UserImageKind = (typeof USER_IMAGE_KINDS)[number];

/** Accepted for every image upload (task pictures and profile photos). */
export const IMAGE_UPLOAD_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
export const MAX_IMAGE_UPLOAD_BYTES = 5 * 1024 * 1024;

export const TASK_SORTS = ['dueDate', 'priority', 'createdAt', 'completedAt'] as const;
export type TaskSort = (typeof TASK_SORTS)[number];

export const PRIORITY_LABELS: Record<Priority, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  URGENT: 'Urgent',
};

export const STATUS_LABELS: Record<TaskStatus, string> = {
  TODO: 'To Do',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
};

/** Higher number = more important. */
export const PRIORITY_RANK: Record<Priority, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, URGENT: 3 };

export const LIMITS = {
  title: 200,
  description: 2000,
  notes: 5000,
  tagLength: 30,
  tagCount: 10,
  categoryName: 50,
  habitName: 80,
  habitDescription: 300,
  userName: 80,
  passwordMin: 8,
  passwordMax: 128,
  maxEstimatedMinutes: 24 * 60,
  maxPageSize: 500,
} as const;

export const COLOR_PALETTE = [
  '#4f46e5',
  '#0891b2',
  '#059669',
  '#65a30d',
  '#d97706',
  '#dc2626',
  '#db2777',
  '#7c3aed',
  '#475569',
  '#0d9488',
] as const;
