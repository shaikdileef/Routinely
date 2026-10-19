import { Prisma } from '@prisma/client';
import {
  dateKeyToUTCDate,
  taskTimingIssues,
  todayInTimeZone,
  utcDateToDateKey,
  type ApiListResponse,
  type Task,
  type TaskQuery,
} from '@planner/shared';
import type { taskCreateSchema, taskUpdateSchema } from '@planner/shared';
import type { z } from 'zod';
import { prisma } from '../db.js';
import { notFound, validationError } from '../lib/errors.js';
import type { AuthContext } from '../lib/http.js';
import { taskInclude, toTaskDTO } from '../lib/serialize.js';
import { refreshTaskReminders } from './reminderService.js';

type TaskCreate = z.output<typeof taskCreateSchema>;
type TaskUpdate = z.output<typeof taskUpdateSchema>;

const toDbDate = (key: string | null | undefined) =>
  key === undefined ? undefined : key === null ? null : dateKeyToUTCDate(key);

async function assertCategoryOwned(userId: string, categoryId: string | null | undefined) {
  if (!categoryId) return;
  const found = await prisma.category.findFirst({
    where: { id: categoryId, userId },
    select: { id: true },
  });
  if (!found) {
    throw validationError([{ path: 'categoryId', message: 'Category not found' }]);
  }
}

export async function findOwnedTask(userId: string, id: string) {
  const task = await prisma.task.findFirst({ where: { id, userId }, include: taskInclude });
  if (!task) throw notFound('Task');
  return task;
}

export function buildTaskWhere(auth: AuthContext, q: TaskQuery): Prisma.TaskWhereInput {
  const today = dateKeyToUTCDate(todayInTimeZone(auth.timezone));
  const and: Prisma.TaskWhereInput[] = [{ userId: auth.userId }];
  const open: Prisma.TaskWhereInput = { status: { not: 'COMPLETED' } };

  switch (q.view) {
    case 'open':
      and.push(open);
      break;
    case 'today':
      and.push({ dueDate: today });
      break;
    case 'upcoming':
      and.push(open, { dueDate: { gt: today } });
      break;
    case 'overdue':
      and.push(open, { dueDate: { lt: today } });
      break;
    case 'completed':
      and.push({ status: 'COMPLETED' });
      break;
    case 'nodate':
      and.push(open, { dueDate: null });
      break;
    case 'all':
      break;
  }

  if (q.search) {
    const s = q.search;
    and.push({
      OR: [
        { title: { contains: s, mode: 'insensitive' } },
        { description: { contains: s, mode: 'insensitive' } },
        { notes: { contains: s, mode: 'insensitive' } },
        { tags: { has: s.toLowerCase() } },
      ],
    });
  }
  if (q.status) and.push({ status: q.status });
  if (q.priority) and.push({ priority: q.priority });
  if (q.categoryId) and.push({ categoryId: q.categoryId === 'none' ? null : q.categoryId });
  if (q.tag) and.push({ tags: { has: q.tag } });
  if (q.from) and.push({ dueDate: { gte: dateKeyToUTCDate(q.from) } });
  if (q.to) and.push({ dueDate: { lte: dateKeyToUTCDate(q.to) } });

  return { AND: and };
}

function buildOrderBy(q: TaskQuery): Prisma.TaskOrderByWithRelationInput[] {
  const tieBreak: Prisma.TaskOrderByWithRelationInput[] = [{ createdAt: 'desc' }, { id: 'asc' }];
  switch (q.sort) {
    case 'priority':
      return [
        { priority: q.order ?? 'desc' },
        { dueDate: { sort: 'asc', nulls: 'last' } },
        ...tieBreak,
      ];
    case 'createdAt':
      return [{ createdAt: q.order ?? 'desc' }, { id: 'asc' }];
    case 'completedAt':
      return [{ completedAt: { sort: q.order ?? 'desc', nulls: 'last' } }, ...tieBreak];
    case 'dueDate':
    default:
      return [
        { dueDate: { sort: q.order ?? 'asc', nulls: 'last' } },
        { startTime: { sort: 'asc', nulls: 'last' } },
        { priority: 'desc' },
        ...tieBreak,
      ];
  }
}

export async function listTasks(auth: AuthContext, q: TaskQuery): Promise<ApiListResponse<Task>> {
  const where = buildTaskWhere(auth, q);
  const [total, rows] = await prisma.$transaction([
    prisma.task.count({ where }),
    prisma.task.findMany({
      where,
      include: taskInclude,
      orderBy: buildOrderBy(q),
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
  ]);
  return {
    data: rows.map(toTaskDTO),
    meta: {
      page: q.page,
      pageSize: q.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
    },
  };
}

export async function getTask(auth: AuthContext, id: string): Promise<Task> {
  return toTaskDTO(await findOwnedTask(auth.userId, id));
}

/**
 * Creates a task. When the client sends a `clientRequestId`, repeated submissions
 * (double clicks, retries after a timeout) return the original task instead of
 * creating duplicates.
 */
export async function createTask(
  auth: AuthContext,
  input: TaskCreate,
): Promise<{ task: Task; created: boolean }> {
  const { clientRequestId } = input;
  if (clientRequestId) {
    const existing = await prisma.task.findUnique({
      where: { userId_clientRequestId: { userId: auth.userId, clientRequestId } },
      include: taskInclude,
    });
    if (existing) return { task: toTaskDTO(existing), created: false };
  }

  await assertCategoryOwned(auth.userId, input.categoryId);
  const status = input.status ?? 'TODO';

  try {
    const row = await prisma.task.create({
      data: {
        userId: auth.userId,
        title: input.title,
        description: input.description ?? null,
        notes: input.notes ?? null,
        dueDate: toDbDate(input.dueDate) ?? null,
        startDate: toDbDate(input.startDate) ?? null,
        startTime: input.startTime ?? null,
        endTime: input.endTime ?? null,
        priority: input.priority ?? auth.defaultPriority,
        status,
        categoryId: input.categoryId ?? null,
        tags: input.tags ?? [],
        estimatedMinutes: input.estimatedMinutes ?? null,
        completedAt: status === 'COMPLETED' ? new Date() : null,
        clientRequestId: clientRequestId ?? null,
      },
      include: taskInclude,
    });
    return { task: toTaskDTO(row), created: true };
  } catch (err) {
    // Two identical requests raced past the lookup above: return the winner.
    if (
      clientRequestId &&
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      const existing = await prisma.task.findUniqueOrThrow({
        where: { userId_clientRequestId: { userId: auth.userId, clientRequestId } },
        include: taskInclude,
      });
      return { task: toTaskDTO(existing), created: false };
    }
    throw err;
  }
}

export async function updateTask(auth: AuthContext, id: string, input: TaskUpdate): Promise<Task> {
  const current = await findOwnedTask(auth.userId, id);
  const dateKey = (d: Date | null) => (d ? utcDateToDateKey(d) : null);

  const issues = taskTimingIssues({
    dueDate: input.dueDate !== undefined ? input.dueDate : dateKey(current.dueDate),
    startDate: input.startDate !== undefined ? input.startDate : dateKey(current.startDate),
    startTime: input.startTime !== undefined ? input.startTime : current.startTime,
    endTime: input.endTime !== undefined ? input.endTime : current.endTime,
  });
  if (issues.length > 0) throw validationError(issues);

  if (input.categoryId !== undefined) await assertCategoryOwned(auth.userId, input.categoryId);

  // completedAt follows status transitions: set when completed, cleared when reopened.
  let completedAt: Date | null | undefined;
  if (input.status === 'COMPLETED' && current.status !== 'COMPLETED') completedAt = new Date();
  if (input.status && input.status !== 'COMPLETED') completedAt = null;

  const { count } = await prisma.task.updateMany({
    where: { id, userId: auth.userId },
    data: {
      title: input.title,
      description: input.description,
      notes: input.notes,
      dueDate: toDbDate(input.dueDate),
      startDate: toDbDate(input.startDate),
      startTime: input.startTime,
      endTime: input.endTime,
      priority: input.priority,
      status: input.status,
      categoryId: input.categoryId,
      tags: input.tags,
      estimatedMinutes: input.estimatedMinutes,
      completedAt,
    },
  });
  if (count === 0) throw notFound('Task');
  // Completing cancels pending reminders, reopening restores them, a new due date moves them.
  if (input.status !== undefined || input.dueDate !== undefined) {
    await refreshTaskReminders(auth.userId, id);
  }
  return getTask(auth, id);
}

/** Deleting a task also deletes its reminders (cascade). */
export async function deleteTask(auth: AuthContext, id: string): Promise<void> {
  const { count } = await prisma.task.deleteMany({ where: { id, userId: auth.userId } });
  if (count === 0) throw notFound('Task');
}
