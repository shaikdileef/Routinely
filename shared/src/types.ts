import type {
  ColorTheme,
  HabitFrequency,
  Priority,
  TaskImageKind,
  TaskStatus,
  Theme,
} from './constants.js';
import type { DateKey } from './dates.js';
import type { ReminderChannel, ReminderSpec, ReminderStatus } from './reminders.js';

/** Successful responses are wrapped as `{ data }` (plus `meta` for lists). */
export interface ApiResponse<T> {
  data: T;
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ApiListResponse<T> {
  data: T[];
  meta: PageMeta;
}

export interface ApiErrorIssue {
  path: string;
  message: string;
}

/** Every error response has this shape. */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    issues?: ApiErrorIssue[];
    details?: Record<string, unknown>;
  };
}

export interface User {
  id: string;
  email: string;
  name: string;
  /** Profile photo URL (versioned, so it can be cached); null when not set. */
  avatarUrl: string | null;
  createdAt: string;
}

export interface UserSettings {
  theme: Theme;
  colorTheme: ColorTheme;
  /** Reminder email address; null means the account email is used. */
  notifyEmail: string | null;
  /** WhatsApp number in international format, e.g. +919876543210. */
  notifyPhone: string | null;
  emailReminders: boolean;
  whatsappReminders: boolean;
  weekStartsOn: 0 | 1;
  timezone: string;
  defaultPriority: Priority;
}

export interface Session {
  user: User;
  settings: UserSettings;
}

export interface CategorySummary {
  id: string;
  name: string;
  color: string;
}

export interface Category extends CategorySummary {
  taskCount: number;
  completedCount: number;
  createdAt: string;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  notes: string | null;
  dueDate: DateKey | null;
  startDate: DateKey | null;
  startTime: string | null;
  endTime: string | null;
  priority: Priority;
  status: TaskStatus;
  categoryId: string | null;
  category: CategorySummary | null;
  tags: string[];
  estimatedMinutes: number | null;
  /** Image URLs (versioned, so they can be cached); null when not set. */
  images: Record<TaskImageKind, string | null>;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A reminder on a task, with how each enabled channel delivered (or will deliver) it. */
export interface TaskReminder {
  key: string;
  spec: ReminderSpec;
  /** ISO instant it is (or was) due. */
  sendAt: string;
  deliveries: { channel: ReminderChannel; status: ReminderStatus; error: string | null }[];
}

/**
 * How a channel delivers: `live` = credentials set, messages really go out; `preview` = not set
 * up yet, so (in development) messages are recorded in the delivery log instead; `off` = not
 * set up and preview disabled.
 */
export type ChannelMode = 'live' | 'preview' | 'off';

export interface NotificationAvailability {
  email: ChannelMode;
  whatsapp: ChannelMode;
}

/** One attempted notification, shown in Settings → Notifications → Recent deliveries. */
export interface DeliveryLogEntry {
  id: string;
  channel: ReminderChannel;
  destination: string;
  subject: string;
  body: string;
  mode: 'LIVE' | 'PREVIEW';
  ok: boolean;
  error: string | null;
  /** True for task reminders, false for test messages. */
  fromReminder: boolean;
  createdAt: string;
}

/** Result of one System check row in Settings. */
export interface SystemCheck {
  key: 'database' | 'scheduler' | 'email' | 'whatsapp' | 'spotify';
  label: string;
  status: 'ok' | 'warning' | 'error' | 'missing';
  detail: string;
  /** What to do when it isn't ok. */
  fix: string | null;
}

export interface HabitStats {
  currentStreak: number;
  longestStreak: number;
  scheduledToday: boolean;
  completedToday: boolean;
  week: { completed: number; scheduled: number };
  month: { completed: number; scheduled: number };
  totalCompletions: number;
}

export interface Habit {
  id: string;
  name: string;
  description: string | null;
  color: string;
  frequency: HabitFrequency;
  daysOfWeek: number[];
  startDate: DateKey;
  createdAt: string;
  completions: DateKey[];
  stats: HabitStats;
}

export interface DailyCount {
  date: DateKey;
  completed: number;
}

export interface WeekCount {
  weekStart: DateKey;
  completed: number;
  /** True for the current week, which is still in progress. */
  partial: boolean;
}

export interface PlannedDay {
  date: DateKey;
  /** Tasks due on this day, whatever their status. */
  planned: number;
  /** How many of those planned tasks are completed. */
  done: number;
}

export interface WeekdayAverage {
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number;
  average: number;
}

/**
 * Averages and weekly trends. Averages only count days since the user joined, so a new
 * account isn't diluted by weeks it didn't exist. Ratios with nothing to measure yet are null.
 */
export interface DashboardInsights {
  /** The last 8 calendar weeks, oldest first; the last entry is the current week. */
  weeks: WeekCount[];
  weeklyAverage: number;
  /** Every day of the current calendar week. */
  thisWeek: PlannedDay[];
  /** Ordered from the user's first day of the week. */
  weekdayAverages: WeekdayAverage[];
  averagePerDay: number;
  /** Mean hours from creating a task to completing it. */
  averageCompletionHours: number | null;
  /** Percentage of completed tasks with a due date that were finished on or before it. */
  onTimeRate: number | null;
}

/** One slice of the "open tasks by category" chart. `color` is null for Other / No category. */
export interface CategorySlice {
  key: string;
  name: string;
  color: string | null;
  count: number;
}

export interface DashboardStats {
  today: DateKey;
  insights: DashboardInsights;
  totals: { all: number; open: number; completed: number };
  todayProgress: { total: number; completed: number; remaining: number; percent: number };
  overdueCount: number;
  completedToday: number;
  completedLast7Days: number;
  inProgressCount: number;
  priorityBreakdown: Record<Priority, number>;
  /** Every open task counted once: overdue first, otherwise by status. */
  openStatus: { todo: number; inProgress: number; overdue: number };
  openByCategory: CategorySlice[];
  weekly: DailyCount[];
  todayTasks: Task[];
  overdueTasks: Task[];
  upcomingTasks: Task[];
}
