import type { Task, TaskImageKind } from '@planner/shared';
import type { TaskImageKind as DbImageKind } from '@prisma/client';
import { prisma } from '../db.js';
import { notFound } from '../lib/errors.js';
import type { AuthContext } from '../lib/http.js';
import { parseImageUpload } from '../lib/images.js';
import { findOwnedTask, getTask } from './taskService.js';

const toDbKind = (kind: TaskImageKind): DbImageKind => (kind === 'before' ? 'BEFORE' : 'AFTER');

export async function getTaskImage(auth: AuthContext, taskId: string, kind: TaskImageKind) {
  await findOwnedTask(auth.userId, taskId);
  const image = await prisma.taskImage.findUnique({
    where: { taskId_kind: { taskId, kind: toDbKind(kind) } },
    select: { mimeType: true, data: true },
  });
  if (!image) throw notFound('Image');
  return image;
}

export async function setTaskImage(
  auth: AuthContext,
  taskId: string,
  kind: TaskImageKind,
  data: unknown,
): Promise<Task> {
  await findOwnedTask(auth.userId, taskId);
  const { mimeType, bytes } = parseImageUpload(data);

  const dbKind = toDbKind(kind);
  await prisma.taskImage.upsert({
    where: { taskId_kind: { taskId, kind: dbKind } },
    create: { taskId, kind: dbKind, mimeType, data: bytes },
    update: { mimeType, data: bytes },
  });
  return getTask(auth, taskId);
}

export async function deleteTaskImage(
  auth: AuthContext,
  taskId: string,
  kind: TaskImageKind,
): Promise<Task> {
  await findOwnedTask(auth.userId, taskId);
  await prisma.taskImage.deleteMany({ where: { taskId, kind: toDbKind(kind) } });
  return getTask(auth, taskId);
}
