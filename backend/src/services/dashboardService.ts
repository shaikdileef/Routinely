import {
  addDays,
  computeDashboardStats,
  dateKeyInTimeZone,
  dateKeyToUTCDate,
  endOfWeek,
  insightsWindowStart,
  startOfWeek,
  todayInTimeZone,
  type DashboardStats,
} from '@planner/shared';
import { prisma } from '../db.js';
import type { AuthContext } from '../lib/http.js';
import { taskInclude, toTaskDTO } from '../lib/serialize.js';

/** Loads only the tasks the dashboard needs, then derives every metric from them. */
export async function getDashboard(auth: AuthContext): Promise<DashboardStats> {
  const today = todayInTimeZone(auth.timezone);
  const { userId, timezone, weekStartsOn } = auth;
  // One extra day before the insights window covers any timezone offset.
  const completedSince = dateKeyToUTCDate(addDays(insightsWindowStart(today, weekStartsOn), -1));

  const [tasks, all, completed, user] = await Promise.all([
    prisma.task.findMany({
      where: {
        userId,
        OR: [
          { status: { not: 'COMPLETED' } },
          { completedAt: { gte: completedSince } },
          {
            dueDate: {
              gte: dateKeyToUTCDate(startOfWeek(today, weekStartsOn)),
              lte: dateKeyToUTCDate(endOfWeek(today, weekStartsOn)),
            },
          },
        ],
      },
      include: taskInclude,
    }),
    prisma.task.count({ where: { userId } }),
    prisma.task.count({ where: { userId, status: 'COMPLETED' } }),
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { createdAt: true } }),
  ]);

  return computeDashboardStats({
    tasks: tasks.map(toTaskDTO),
    today,
    timezone,
    weekStartsOn,
    joinedOn: dateKeyInTimeZone(user.createdAt, timezone),
    totals: { all, completed },
  });
}
