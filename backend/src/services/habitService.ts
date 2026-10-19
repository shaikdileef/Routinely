import type { Prisma } from '@prisma/client';
import {
  computeHabitStats,
  dateKeyToUTCDate,
  isScheduledOn,
  todayInTimeZone,
  utcDateToDateKey,
  type Habit,
  type habitCreateSchema,
  type habitUpdateSchema,
} from '@planner/shared';
import type { z } from 'zod';
import { prisma } from '../db.js';
import { AppError, notFound, validationError } from '../lib/errors.js';
import type { AuthContext } from '../lib/http.js';

type HabitCreate = z.output<typeof habitCreateSchema>;
type HabitUpdate = z.output<typeof habitUpdateSchema>;

const habitInclude = {
  completions: { select: { date: true }, orderBy: { date: 'asc' } },
} satisfies Prisma.HabitInclude;
type HabitRow = Prisma.HabitGetPayload<{ include: typeof habitInclude }>;

function toHabitDTO(auth: AuthContext, h: HabitRow): Habit {
  const completions = h.completions.map((c) => utcDateToDateKey(c.date));
  const startDate = utcDateToDateKey(h.startDate);
  return {
    id: h.id,
    name: h.name,
    description: h.description,
    color: h.color,
    frequency: h.frequency,
    daysOfWeek: h.daysOfWeek,
    startDate,
    createdAt: h.createdAt.toISOString(),
    completions,
    stats: computeHabitStats({
      frequency: h.frequency,
      daysOfWeek: h.daysOfWeek,
      startDate,
      completions,
      today: todayInTimeZone(auth.timezone),
      weekStartsOn: auth.weekStartsOn,
    }),
  };
}

const duplicateName = () =>
  new AppError(409, 'DUPLICATE_NAME', 'You already have a habit with this name', {
    issues: [{ path: 'name', message: 'You already have a habit with this name' }],
  });

async function findOwnedHabit(userId: string, id: string) {
  const habit = await prisma.habit.findFirst({ where: { id, userId }, include: habitInclude });
  if (!habit) throw notFound('Habit');
  return habit;
}

async function assertNameAvailable(userId: string, name: string, exceptId?: string) {
  const clash = await prisma.habit.findFirst({
    where: {
      userId,
      name: { equals: name, mode: 'insensitive' },
      NOT: exceptId ? { id: exceptId } : undefined,
    },
    select: { id: true },
  });
  if (clash) throw duplicateName();
}

export async function listHabits(auth: AuthContext): Promise<Habit[]> {
  const rows = await prisma.habit.findMany({
    where: { userId: auth.userId },
    include: habitInclude,
    orderBy: { createdAt: 'asc' },
  });
  return rows.map((h) => toHabitDTO(auth, h));
}

export async function getHabit(auth: AuthContext, id: string): Promise<Habit> {
  return toHabitDTO(auth, await findOwnedHabit(auth.userId, id));
}

export async function createHabit(auth: AuthContext, input: HabitCreate): Promise<Habit> {
  await assertNameAvailable(auth.userId, input.name);
  const row = await prisma.habit.create({
    data: {
      userId: auth.userId,
      name: input.name,
      description: input.description ?? null,
      color: input.color,
      frequency: input.frequency,
      daysOfWeek: input.frequency === 'DAILY' ? [] : input.daysOfWeek,
      startDate: dateKeyToUTCDate(todayInTimeZone(auth.timezone)),
    },
    include: habitInclude,
  });
  return toHabitDTO(auth, row);
}

export async function updateHabit(
  auth: AuthContext,
  id: string,
  input: HabitUpdate,
): Promise<Habit> {
  const current = await findOwnedHabit(auth.userId, id);
  if (input.name) await assertNameAvailable(auth.userId, input.name, id);

  const frequency = input.frequency ?? current.frequency;
  const daysOfWeek = frequency === 'DAILY' ? [] : (input.daysOfWeek ?? current.daysOfWeek);
  if (frequency === 'SPECIFIC_DAYS' && daysOfWeek.length === 0) {
    throw validationError([{ path: 'daysOfWeek', message: 'Pick at least one day' }]);
  }

  await prisma.habit.update({
    where: { id },
    data: {
      name: input.name,
      description: input.description,
      color: input.color,
      frequency,
      daysOfWeek,
    },
  });
  return getHabit(auth, id);
}

export async function deleteHabit(auth: AuthContext, id: string): Promise<void> {
  const { count } = await prisma.habit.deleteMany({ where: { id, userId: auth.userId } });
  if (count === 0) throw notFound('Habit');
}

/** Marks (done=true) or unmarks a habit for a date. Idempotent in both directions. */
export async function setHabitCompletion(
  auth: AuthContext,
  id: string,
  date: string,
  done: boolean,
): Promise<Habit> {
  const habit = await findOwnedHabit(auth.userId, id);
  if (done) {
    if (date > todayInTimeZone(auth.timezone)) {
      throw validationError([
        { path: 'date', message: 'You cannot complete a habit for a future date' },
      ]);
    }
    if (!isScheduledOn(habit, date)) {
      throw validationError([{ path: 'date', message: 'This habit is not scheduled on that day' }]);
    }
    const dbDate = dateKeyToUTCDate(date);
    await prisma.habitCompletion.upsert({
      where: { habitId_date: { habitId: id, date: dbDate } },
      create: { habitId: id, date: dbDate },
      update: {},
    });
  } else {
    await prisma.habitCompletion.deleteMany({
      where: { habitId: id, date: dateKeyToUTCDate(date) },
    });
  }
  return getHabit(auth, id);
}
