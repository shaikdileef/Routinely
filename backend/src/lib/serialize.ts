import type { Prisma, User as UserRow, UserSettings as SettingsRow } from '@prisma/client';
import { utcDateToDateKey, type Task, type User, type UserSettings } from '@planner/shared';

export const taskInclude = {
  category: { select: { id: true, name: true, color: true } },
  // Only image metadata; the bytes are served separately by the image route.
  images: { select: { kind: true, updatedAt: true } },
} satisfies Prisma.TaskInclude;

export type TaskRow = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;

const dateKeyOrNull = (d: Date | null) => (d ? utcDateToDateKey(d) : null);

/** The `v` parameter changes whenever the image is replaced, so browsers can cache each version. */
function taskImageUrls(t: TaskRow): Task['images'] {
  const urls: Task['images'] = { before: null, after: null };
  for (const image of t.images) {
    const kind = image.kind === 'BEFORE' ? 'before' : 'after';
    urls[kind] = `/api/tasks/${t.id}/images/${kind}?v=${image.updatedAt.getTime()}`;
  }
  return urls;
}

export function toTaskDTO(t: TaskRow): Task {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    notes: t.notes,
    dueDate: dateKeyOrNull(t.dueDate),
    startDate: dateKeyOrNull(t.startDate),
    startTime: t.startTime,
    endTime: t.endTime,
    priority: t.priority,
    status: t.status,
    categoryId: t.categoryId,
    category: t.category,
    tags: t.tags,
    estimatedMinutes: t.estimatedMinutes,
    images: taskImageUrls(t),
    completedAt: t.completedAt?.toISOString() ?? null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

/** Only image versions are loaded with the user; the bytes are served by the image route. */
export const userInclude = {
  images: { select: { kind: true, updatedAt: true } },
} satisfies Prisma.UserInclude;

export type UserWithImages = UserRow & {
  images: { kind: 'AVATAR'; updatedAt: Date }[];
};

/** `/api/auth/images/<kind>?v=<version>`, or null when the user hasn't added that image. */
function userImageUrl(u: UserWithImages, kind: 'AVATAR') {
  const image = u.images.find((i) => i.kind === kind);
  if (!image) return null;
  return `/api/auth/images/${kind.toLowerCase()}?v=${image.updatedAt.getTime()}`;
}

export function toUserDTO(u: UserWithImages): User {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    avatarUrl: userImageUrl(u, 'AVATAR'),
    createdAt: u.createdAt.toISOString(),
  };
}

export function toSettingsDTO(s: SettingsRow): UserSettings {
  return {
    theme: s.theme,
    colorTheme: s.colorTheme,
    weekStartsOn: s.weekStartsOn === 0 ? 0 : 1,
    timezone: s.timezone,
    defaultPriority: s.defaultPriority,
    notifyEmail: s.notifyEmail,
    notifyPhone: s.notifyPhone,
    emailReminders: s.emailReminders,
    whatsappReminders: s.whatsappReminders,
  };
}
