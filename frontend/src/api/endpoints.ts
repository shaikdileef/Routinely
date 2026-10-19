import type {
  ApiListResponse,
  ApiResponse,
  Category,
  CategoryCreateInput,
  CategoryUpdateInput,
  ChannelMode,
  DashboardStats,
  DeliveryLogEntry,
  Habit,
  HabitCreateInput,
  HabitUpdateInput,
  LoginInput,
  NotificationAvailability,
  PasswordChangeInput,
  ProfileUpdateInput,
  RegisterInput,
  ReminderChannel,
  ReminderSpec,
  Session,
  SettingsUpdateInput,
  SpotifyStatus,
  SpotifySummary,
  SystemCheck,
  Task,
  TaskCreateInput,
  TaskImageKind,
  TaskQueryInput,
  TaskReminder,
  TaskUpdateInput,
  User,
  UserImageKind,
  UserSettings,
} from '@planner/shared';
import { request } from './client';

const data = <T>(p: Promise<ApiResponse<T>>) => p.then((r) => r.data);

export const authApi = {
  me: () => data(request<ApiResponse<Session>>('GET', '/auth/me')),
  login: (body: LoginInput) => data(request<ApiResponse<Session>>('POST', '/auth/login', { body })),
  register: (body: RegisterInput) =>
    data(request<ApiResponse<Session>>('POST', '/auth/register', { body })),
  logout: () => request<void>('POST', '/auth/logout'),
  updateProfile: (body: ProfileUpdateInput) =>
    data(request<ApiResponse<User>>('PATCH', '/auth/profile', { body })),
  changePassword: (body: PasswordChangeInput) => request<void>('POST', '/auth/password', { body }),
  setImage: (kind: UserImageKind, file: Blob) =>
    data(request<ApiResponse<User>>('PUT', `/auth/images/${kind}`, { file })),
  removeImage: (kind: UserImageKind) =>
    data(request<ApiResponse<User>>('DELETE', `/auth/images/${kind}`)),
};

export const settingsApi = {
  update: (body: SettingsUpdateInput) =>
    data(request<ApiResponse<UserSettings>>('PATCH', '/settings', { body })),
  notificationAvailability: () =>
    data(request<ApiResponse<NotificationAvailability>>('GET', '/settings/notifications')),
  sendTestNotification: (channel: ReminderChannel) =>
    data(
      request<ApiResponse<{ to: string; mode: ChannelMode }>>(
        'POST',
        '/settings/notifications/test',
        {
          body: { channel },
        },
      ),
    ),
  deliveries: () =>
    data(request<ApiResponse<DeliveryLogEntry[]>>('GET', '/settings/notifications/log')),
};

export const tasksApi = {
  list: (query: TaskQueryInput) =>
    request<ApiListResponse<Task>>('GET', '/tasks', {
      query: query as Record<string, string | number | undefined>,
    }),
  get: (id: string) => data(request<ApiResponse<Task>>('GET', `/tasks/${id}`)),
  create: (body: TaskCreateInput) => data(request<ApiResponse<Task>>('POST', '/tasks', { body })),
  update: (id: string, body: TaskUpdateInput) =>
    data(request<ApiResponse<Task>>('PATCH', `/tasks/${id}`, { body })),
  remove: (id: string) => request<void>('DELETE', `/tasks/${id}`),
  setImage: (id: string, kind: TaskImageKind, file: Blob) =>
    data(request<ApiResponse<Task>>('PUT', `/tasks/${id}/images/${kind}`, { file })),
  removeImage: (id: string, kind: TaskImageKind) =>
    data(request<ApiResponse<Task>>('DELETE', `/tasks/${id}/images/${kind}`)),
  reminders: (id: string) =>
    data(request<ApiResponse<TaskReminder[]>>('GET', `/tasks/${id}/reminders`)),
  setReminders: (id: string, reminders: ReminderSpec[]) =>
    data(
      request<ApiResponse<TaskReminder[]>>('PUT', `/tasks/${id}/reminders`, {
        body: { reminders },
      }),
    ),
};

export const categoriesApi = {
  list: () => data(request<ApiResponse<Category[]>>('GET', '/categories')),
  create: (body: CategoryCreateInput) =>
    data(request<ApiResponse<Category>>('POST', '/categories', { body })),
  update: (id: string, body: CategoryUpdateInput) =>
    data(request<ApiResponse<Category>>('PATCH', `/categories/${id}`, { body })),
  remove: (id: string, reassignTo?: string) =>
    data(
      request<ApiResponse<{ movedTasks: number }>>('DELETE', `/categories/${id}`, {
        query: { reassignTo },
      }),
    ),
};

export const habitsApi = {
  list: () => data(request<ApiResponse<Habit[]>>('GET', '/habits')),
  create: (body: HabitCreateInput) =>
    data(request<ApiResponse<Habit>>('POST', '/habits', { body })),
  update: (id: string, body: HabitUpdateInput) =>
    data(request<ApiResponse<Habit>>('PATCH', `/habits/${id}`, { body })),
  remove: (id: string) => request<void>('DELETE', `/habits/${id}`),
  setCompletion: (id: string, date: string, done: boolean) =>
    data(request<ApiResponse<Habit>>(done ? 'PUT' : 'DELETE', `/habits/${id}/completions/${date}`)),
};

export const spotifyApi = {
  status: () => data(request<ApiResponse<SpotifyStatus>>('GET', '/spotify/status')),
  connectUrl: () => data(request<ApiResponse<{ url: string }>>('POST', '/spotify/connect')),
  summary: () => data(request<ApiResponse<SpotifySummary>>('GET', '/spotify/summary')),
  disconnect: () => request<void>('DELETE', '/spotify'),
};

export const systemApi = {
  checks: () => data(request<ApiResponse<SystemCheck[]>>('GET', '/system/checks')),
};

export const dashboardApi = {
  get: () => data(request<ApiResponse<DashboardStats>>('GET', '/dashboard')),
};
