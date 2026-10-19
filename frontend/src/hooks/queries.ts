import {
  TASK_IMAGE_KINDS,
  type CategoryCreateInput,
  type CategoryUpdateInput,
  type HabitCreateInput,
  type HabitUpdateInput,
  type Task,
  type TaskCreateInput,
  type TaskImageKind,
  type ReminderSpec,
  type TaskQueryInput,
  type TaskUpdateInput,
} from '@planner/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  categoriesApi,
  dashboardApi,
  habitsApi,
  settingsApi,
  spotifyApi,
  systemApi,
  tasksApi,
} from '../api/endpoints';

export const queryKeys = {
  tasks: ['tasks'] as const,
  taskList: (q: TaskQueryInput) => ['tasks', 'list', q] as const,
  categories: ['categories'] as const,
  habits: ['habits'] as const,
  dashboard: ['dashboard'] as const,
};

/**
 * Mutations are not optimistic: the UI only changes after the server confirms,
 * then every view that could show the affected data is refetched.
 */
function useInvalidateTaskData() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: queryKeys.tasks }),
      qc.invalidateQueries({ queryKey: queryKeys.dashboard }),
      qc.invalidateQueries({ queryKey: queryKeys.categories }),
    ]);
}

export function useTasks(query: TaskQueryInput, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.taskList(query),
    queryFn: () => tasksApi.list(query),
    placeholderData: keepPreviousData,
    enabled: options.enabled ?? true,
  });
}

export function useCreateTask() {
  const invalidate = useInvalidateTaskData();
  return useMutation({
    mutationFn: (input: TaskCreateInput) => tasksApi.create(input),
    onSuccess: invalidate,
  });
}

export function useUpdateTask() {
  const invalidate = useInvalidateTaskData();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: TaskUpdateInput }) =>
      tasksApi.update(id, input),
    onSuccess: invalidate,
  });
}

/** A pending change to one of a task's images, applied after the task itself is saved. */
export type TaskImageChange = { type: 'set'; file: File } | { type: 'remove' };
export type TaskImageChanges = Partial<Record<TaskImageKind, TaskImageChange>>;

export function useSaveTaskImages() {
  const invalidate = useInvalidateTaskData();
  return useMutation({
    mutationFn: async ({ id, changes }: { id: string; changes: TaskImageChanges }) => {
      for (const kind of TASK_IMAGE_KINDS) {
        const change = changes[kind];
        if (change?.type === 'set') await tasksApi.setImage(id, kind, change.file);
        if (change?.type === 'remove') await tasksApi.removeImage(id, kind);
      }
    },
    // Refetch even after a partial failure, so lists show whatever was saved.
    onSettled: invalidate,
  });
}

export function useTaskReminders(taskId: string | undefined) {
  return useQuery({
    queryKey: ['tasks', 'reminders', taskId],
    queryFn: () => tasksApi.reminders(taskId!),
    enabled: Boolean(taskId),
  });
}

export function useSaveTaskReminders() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reminders }: { id: string; reminders: ReminderSpec[] }) =>
      tasksApi.setReminders(id, reminders),
    onSuccess: (_data, { id }) => qc.invalidateQueries({ queryKey: ['tasks', 'reminders', id] }),
  });
}

export function useNotificationAvailability() {
  return useQuery({
    queryKey: ['notification-availability'],
    queryFn: settingsApi.notificationAvailability,
    staleTime: 5 * 60_000,
  });
}

/** Recent reminder/test messages; polled so scheduled reminders show up as they go out. */
export function useDeliveryLog() {
  return useQuery({
    queryKey: ['delivery-log'],
    queryFn: settingsApi.deliveries,
    refetchInterval: 30_000,
  });
}

/** Runs only when asked (the checks call outside services). */
export function useSystemChecks() {
  return useQuery({
    queryKey: ['system-checks'],
    queryFn: systemApi.checks,
    enabled: false,
    staleTime: Infinity,
  });
}

export function useSpotifyStatus() {
  return useQuery({ queryKey: ['spotify', 'status'], queryFn: spotifyApi.status });
}

/** Listening summary; refreshed every minute while the dashboard is open (for "now playing"). */
export function useSpotifySummary(enabled: boolean) {
  return useQuery({
    queryKey: ['spotify', 'summary'],
    queryFn: spotifyApi.summary,
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useDisconnectSpotify() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: spotifyApi.disconnect,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['spotify'] }),
  });
}

export function useDeleteTask() {
  const invalidate = useInvalidateTaskData();
  return useMutation({
    mutationFn: (task: Pick<Task, 'id'>) => tasksApi.remove(task.id),
    onSuccess: invalidate,
  });
}

export function useCategories() {
  return useQuery({ queryKey: queryKeys.categories, queryFn: categoriesApi.list });
}

export function useCreateCategory() {
  const invalidate = useInvalidateTaskData();
  return useMutation({
    mutationFn: (input: CategoryCreateInput) => categoriesApi.create(input),
    onSuccess: invalidate,
  });
}

export function useUpdateCategory() {
  const invalidate = useInvalidateTaskData();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CategoryUpdateInput }) =>
      categoriesApi.update(id, input),
    onSuccess: invalidate,
  });
}

export function useDeleteCategory() {
  const invalidate = useInvalidateTaskData();
  return useMutation({
    mutationFn: ({ id, reassignTo }: { id: string; reassignTo?: string }) =>
      categoriesApi.remove(id, reassignTo),
    onSuccess: invalidate,
  });
}

export function useDashboard() {
  return useQuery({ queryKey: queryKeys.dashboard, queryFn: dashboardApi.get });
}

export function useHabits() {
  return useQuery({ queryKey: queryKeys.habits, queryFn: habitsApi.list });
}

function useInvalidateHabits() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: queryKeys.habits });
}

export function useCreateHabit() {
  const invalidate = useInvalidateHabits();
  return useMutation({
    mutationFn: (input: HabitCreateInput) => habitsApi.create(input),
    onSuccess: invalidate,
  });
}

export function useUpdateHabit() {
  const invalidate = useInvalidateHabits();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: HabitUpdateInput }) =>
      habitsApi.update(id, input),
    onSuccess: invalidate,
  });
}

export function useDeleteHabit() {
  const invalidate = useInvalidateHabits();
  return useMutation({ mutationFn: (id: string) => habitsApi.remove(id), onSuccess: invalidate });
}

export function useSetHabitCompletion() {
  const invalidate = useInvalidateHabits();
  return useMutation({
    mutationFn: ({ id, date, done }: { id: string; date: string; done: boolean }) =>
      habitsApi.setCompletion(id, date, done),
    onSuccess: invalidate,
  });
}
