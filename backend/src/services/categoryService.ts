import type { Category, categoryCreateSchema, categoryUpdateSchema } from '@planner/shared';
import type { z } from 'zod';
import { prisma } from '../db.js';
import { AppError, notFound, validationError } from '../lib/errors.js';
import type { AuthContext } from '../lib/http.js';

type CategoryCreate = z.output<typeof categoryCreateSchema>;
type CategoryUpdate = z.output<typeof categoryUpdateSchema>;

const duplicateName = () =>
  new AppError(409, 'DUPLICATE_NAME', 'You already have a category with this name', {
    issues: [{ path: 'name', message: 'You already have a category with this name' }],
  });

async function findOwnedCategory(userId: string, id: string) {
  const category = await prisma.category.findFirst({ where: { id, userId } });
  if (!category) throw notFound('Category');
  return category;
}

async function assertNameAvailable(userId: string, name: string, exceptId?: string) {
  const clash = await prisma.category.findFirst({
    where: {
      userId,
      name: { equals: name, mode: 'insensitive' },
      NOT: exceptId ? { id: exceptId } : undefined,
    },
    select: { id: true },
  });
  if (clash) throw duplicateName();
}

export async function listCategories(auth: AuthContext): Promise<Category[]> {
  const [categories, completed] = await Promise.all([
    prisma.category.findMany({
      where: { userId: auth.userId },
      orderBy: { name: 'asc' },
      include: { _count: { select: { tasks: true } } },
    }),
    prisma.task.groupBy({
      by: ['categoryId'],
      where: { userId: auth.userId, status: 'COMPLETED', categoryId: { not: null } },
      _count: { _all: true },
    }),
  ]);
  const completedBy = new Map(completed.map((c) => [c.categoryId, c._count._all]));
  return categories.map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color,
    createdAt: c.createdAt.toISOString(),
    taskCount: c._count.tasks,
    completedCount: completedBy.get(c.id) ?? 0,
  }));
}

async function getCategoryDTO(auth: AuthContext, id: string): Promise<Category> {
  const found = (await listCategories(auth)).find((c) => c.id === id);
  if (!found) throw notFound('Category');
  return found;
}

export async function createCategory(auth: AuthContext, input: CategoryCreate): Promise<Category> {
  await assertNameAvailable(auth.userId, input.name);
  const row = await prisma.category.create({ data: { ...input, userId: auth.userId } });
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    createdAt: row.createdAt.toISOString(),
    taskCount: 0,
    completedCount: 0,
  };
}

export async function updateCategory(
  auth: AuthContext,
  id: string,
  input: CategoryUpdate,
): Promise<Category> {
  await findOwnedCategory(auth.userId, id);
  if (input.name) await assertNameAvailable(auth.userId, input.name, id);
  await prisma.category.update({ where: { id }, data: input });
  return getCategoryDTO(auth, id);
}

/**
 * Deleting a category never deletes tasks. If it still has tasks the caller must
 * say where they go: another category id, or "none" to leave them uncategorized.
 */
export async function deleteCategory(
  auth: AuthContext,
  id: string,
  reassignTo: string | undefined,
) {
  await findOwnedCategory(auth.userId, id);
  const taskCount = await prisma.task.count({ where: { userId: auth.userId, categoryId: id } });

  if (taskCount > 0 && reassignTo === undefined) {
    throw new AppError(
      409,
      'CATEGORY_HAS_TASKS',
      `This category has ${taskCount} task${taskCount === 1 ? '' : 's'}. Choose where to move them before deleting.`,
      { details: { taskCount } },
    );
  }
  if (reassignTo && reassignTo !== 'none') {
    if (reassignTo === id)
      throw validationError([{ path: 'reassignTo', message: 'Choose a different category' }]);
    const target = await prisma.category.findFirst({
      where: { id: reassignTo, userId: auth.userId },
    });
    if (!target)
      throw validationError([{ path: 'reassignTo', message: 'Target category not found' }]);
  }

  const newCategoryId = reassignTo && reassignTo !== 'none' ? reassignTo : null;
  const [moved] = await prisma.$transaction([
    prisma.task.updateMany({
      where: { userId: auth.userId, categoryId: id },
      data: { categoryId: newCategoryId },
    }),
    prisma.category.delete({ where: { id } }),
  ]);
  return { movedTasks: moved.count };
}
