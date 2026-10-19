import { Prisma, type Reminder, type ReminderChannel, type ReminderStatus } from '@prisma/client';
import {
  dateKeyToUTCDate,
  diffDays,
  REMINDER_LATE_LIMIT_MS,
  reminderKey,
  reminderSendAt,
  todayInTimeZone,
  utcDateToDateKey,
  type DateKey,
  type DeliveryLogEntry,
  type ReminderSpec,
  type TaskReminder,
} from '@planner/shared';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { AppError, validationError } from '../lib/errors.js';
import type { AuthContext } from '../lib/http.js';
import { deliver, NotConfiguredError, type Notification } from '../notifications/index.js';
import { findOwnedTask } from './taskService.js';

/** A claimed reminder older than this was interrupted mid-send; it is failed, not resent. */
const STALE_SENDING_MS = 10 * 60 * 1000;
const CLAIM_BATCH = 100;

interface ReminderContext {
  timezone: string;
  channels: ReminderChannel[];
}

/** Statuses the app may still change; sent, failed and in-flight reminders are history. */
const MUTABLE: ReminderStatus[] = ['PENDING', 'CANCELLED'];

function specFromRow(r: Reminder): ReminderSpec {
  return r.type === 'RELATIVE'
    ? { type: 'relative', daysBefore: r.daysBefore ?? 0, time: r.localTime }
    : { type: 'custom', date: utcDateToDateKey(r.localDate!), time: r.localTime };
}

/** Groups per-channel rows back into the reminders the user chose. */
function toTaskReminders(rows: Reminder[]): TaskReminder[] {
  const byKey = new Map<string, TaskReminder>();
  for (const r of rows) {
    const entry = byKey.get(r.specKey) ?? {
      key: r.specKey,
      spec: specFromRow(r),
      sendAt: r.sendAt.toISOString(),
      deliveries: [],
    };
    entry.deliveries.push({ channel: r.channel, status: r.status, error: r.error });
    byKey.set(r.specKey, entry);
  }
  return [...byKey.values()].sort((a, b) => a.sendAt.localeCompare(b.sendAt));
}

async function reminderContext(userId: string): Promise<ReminderContext> {
  const settings = await prisma.userSettings.findUnique({ where: { userId } });
  const channels: ReminderChannel[] = [];
  if (settings?.emailReminders ?? true) channels.push('EMAIL');
  if (settings?.whatsappReminders && settings.notifyPhone) channels.push('WHATSAPP');
  return { timezone: settings?.timezone ?? 'UTC', channels };
}

/**
 * Makes a task's reminder rows match `specs` × the enabled channels. Times are recalculated
 * from the current due date; reminders are cancelled while the task is completed or when a
 * relative reminder has no due date. Sent and failed rows are kept as history.
 */
async function applyReminders(
  task: { id: string; userId: string; status: string; dueDate: Date | null },
  specs: ReminderSpec[],
  ctx: ReminderContext,
) {
  const dueDate = task.dueDate ? utcDateToDateKey(task.dueDate) : null;
  const existing = await prisma.reminder.findMany({ where: { taskId: task.id } });
  const wanted = new Map(specs.map((s) => [reminderKey(s), s]));

  await prisma.$transaction(async (tx) => {
    // Drop reminders the user removed, or on channels that are now switched off.
    const obsolete = existing.filter(
      (r) =>
        MUTABLE.includes(r.status) && (!wanted.has(r.specKey) || !ctx.channels.includes(r.channel)),
    );
    if (obsolete.length > 0) {
      await tx.reminder.deleteMany({ where: { id: { in: obsolete.map((r) => r.id) } } });
    }

    const now = Date.now();
    for (const [key, spec] of wanted) {
      const sendAt = reminderSendAt(spec, dueDate, ctx.timezone);
      const active = task.status !== 'COMPLETED' && sendAt !== null;
      for (const channel of ctx.channels) {
        const row = existing.find((r) => r.specKey === key && r.channel === channel);
        // A reminder that was already waiting stays due even if its time just passed; a new
        // or reactivated one (new channel, reopened task) never fires for a time in the past.
        const wasWaiting = row?.status === 'PENDING';
        const inPast = sendAt !== null && sendAt.getTime() <= now;
        const status: ReminderStatus = active && (wasWaiting || !inPast) ? 'PENDING' : 'CANCELLED';
        if (!row) {
          await tx.reminder.create({
            data: {
              taskId: task.id,
              userId: task.userId,
              channel,
              status,
              sendAt: sendAt ?? new Date(),
              type: spec.type === 'relative' ? 'RELATIVE' : 'CUSTOM',
              daysBefore: spec.type === 'relative' ? spec.daysBefore : null,
              localDate: spec.type === 'custom' ? dateKeyToUTCDate(spec.date) : null,
              localTime: spec.time,
              specKey: key,
            },
          });
        } else if (MUTABLE.includes(row.status)) {
          await tx.reminder.update({
            where: { id: row.id },
            data: { status, sendAt: sendAt ?? row.sendAt, error: null },
          });
        }
      }
    }
  });
}

/** The reminders a task currently has, as the user chose them. */
function currentSpecs(rows: Reminder[]): ReminderSpec[] {
  return [...new Map(rows.map((r) => [r.specKey, specFromRow(r)])).values()];
}

export async function listTaskReminders(auth: AuthContext, taskId: string) {
  await findOwnedTask(auth.userId, taskId);
  const rows = await prisma.reminder.findMany({
    where: { taskId, userId: auth.userId },
    orderBy: { sendAt: 'asc' },
  });
  return toTaskReminders(rows);
}

/** Replaces a task's reminders with `specs` (from the task form). */
export async function setTaskReminders(
  auth: AuthContext,
  taskId: string,
  specs: ReminderSpec[],
): Promise<TaskReminder[]> {
  const task = await findOwnedTask(auth.userId, taskId);
  const dueDate = task.dueDate ? utcDateToDateKey(task.dueDate) : null;
  const unchanged = new Set(
    (await prisma.reminder.findMany({ where: { taskId }, select: { specKey: true } })).map(
      (r) => r.specKey,
    ),
  );

  specs.forEach((spec, i) => {
    const sendAt = reminderSendAt(spec, dueDate, auth.timezone);
    if (sendAt === null) {
      throw validationError([
        { path: `reminders.${i}`, message: 'Add a due date to use reminders before it' },
      ]);
    }
    // New reminders must be in the future; ones already saved may have been sent already.
    if (!unchanged.has(reminderKey(spec)) && sendAt.getTime() < Date.now()) {
      throw validationError([
        { path: `reminders.${i}`, message: 'This reminder time has already passed' },
      ]);
    }
  });

  await applyReminders(task, specs, await reminderContext(auth.userId));
  return listTaskReminders(auth, taskId);
}

/**
 * Recalculates a task's reminders after it changed: due date moves, completion cancels
 * pending reminders, reopening restores them.
 */
export async function refreshTaskReminders(userId: string, taskId: string) {
  const rows = await prisma.reminder.findMany({ where: { taskId } });
  if (rows.length === 0) return;
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) return;
  await applyReminders(task, currentSpecs(rows), await reminderContext(userId));
}

/** Re-applies every task's reminders after the user's channels, phone or timezone changed. */
export async function refreshUserReminders(userId: string) {
  const ctx = await reminderContext(userId);
  const rows = await prisma.reminder.findMany({ where: { userId } });
  const taskIds = [...new Set(rows.map((r) => r.taskId))];
  const tasks = await prisma.task.findMany({ where: { id: { in: taskIds } } });
  for (const task of tasks) {
    await applyReminders(task, currentSpecs(rows.filter((r) => r.taskId === task.id)), ctx);
  }
}

/* ------------------------------- sending -------------------------------- */

function describeDue(dueDate: DateKey | null, today: DateKey): string {
  if (!dueDate) return 'Here is the reminder you set';
  const days = diffDays(dueDate, today);
  if (days === 0) return 'It is due today';
  if (days === 1) return 'It is due tomorrow';
  if (days < 0) return `It was due ${-days === 1 ? 'yesterday' : `${-days} days ago`}`;
  const date = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(dateKeyToUTCDate(dueDate));
  return `It is due on ${date} (in ${days} days)`;
}

function reminderMessage(title: string, dueDate: DateKey | null, timezone: string): Notification {
  const due = describeDue(dueDate, todayInTimeZone(timezone));
  return {
    subject: `Reminder: ${title}`,
    text: `${due}.\n\nOpen Routinely: ${config.APP_URL}/tasks`,
  };
}

async function destinationFor(userId: string, channel: ReminderChannel): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { settings: true } });
  if (!user) return null;
  return channel === 'EMAIL'
    ? (user.settings?.notifyEmail ?? user.email)
    : (user.settings?.notifyPhone ?? null);
}

export interface ProcessResult {
  sent: number;
  failed: number;
  cancelled: number;
}

/**
 * Sends every reminder that is due. Each one is claimed (PENDING → SENDING) inside a row
 * lock with SKIP LOCKED before sending, so it goes out at most once even if the server
 * restarts or several copies run. Reminders found more than 12 hours late are marked missed.
 */
export async function processDueReminders(now = new Date()): Promise<ProcessResult> {
  const result: ProcessResult = { sent: 0, failed: 0, cancelled: 0 };

  await prisma.reminder.updateMany({
    where: { status: 'SENDING', attemptedAt: { lt: new Date(now.getTime() - STALE_SENDING_MS) } },
    data: { status: 'FAILED', error: 'Interrupted while sending; not retried to avoid duplicates' },
  });

  // Prisma stores DateTime as UTC in `timestamp` (no time zone) columns, but a Date parameter
  // arrives as `timestamptz`; convert it explicitly so the server's TimeZone setting (e.g.
  // Asia/Calcutta on a local install) can't shift the comparison by hours.
  const utcNow = Prisma.sql`(${now}::timestamptz AT TIME ZONE 'UTC')`;
  const claimed = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE "Reminder" SET "status" = 'SENDING', "attemptedAt" = ${utcNow}, "updatedAt" = ${utcNow}
    WHERE "id" IN (
      SELECT "id" FROM "Reminder"
      WHERE "status" = 'PENDING' AND "sendAt" <= ${utcNow}
      ORDER BY "sendAt"
      LIMIT ${CLAIM_BATCH}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING "id"`;

  for (const { id } of claimed) {
    const reminder = await prisma.reminder.findUnique({
      where: { id },
      include: { task: true, user: { include: { settings: true } } },
    });
    if (!reminder) continue;
    const finish = (status: ReminderStatus, error: string | null = null) =>
      prisma.reminder.update({
        where: { id },
        data: { status, error, sentAt: status === 'SENT' ? new Date() : null },
      });

    if (reminder.task.status === 'COMPLETED') {
      await finish('CANCELLED');
      result.cancelled += 1;
      continue;
    }
    if (now.getTime() - reminder.sendAt.getTime() > REMINDER_LATE_LIMIT_MS) {
      await finish('FAILED', 'Missed: the server was offline when this reminder was due');
      result.failed += 1;
      continue;
    }

    const to = await destinationFor(reminder.userId, reminder.channel);
    if (!to) {
      await finish('FAILED', 'No phone number is saved for WhatsApp reminders');
      result.failed += 1;
      continue;
    }

    try {
      const timezone = reminder.user.settings?.timezone ?? 'UTC';
      const dueDate = reminder.task.dueDate ? utcDateToDateKey(reminder.task.dueDate) : null;
      await deliver(reminder.channel, to, reminderMessage(reminder.task.title, dueDate, timezone), {
        userId: reminder.userId,
        reminderId: reminder.id,
      });
      await finish('SENT');
      result.sent += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      await finish('FAILED', message.slice(0, 500));
      result.failed += 1;
    }
  }
  return result;
}

/** Sends a test message on one channel to the user's saved destination. */
export async function sendTestNotification(userId: string, channel: ReminderChannel) {
  const to = await destinationFor(userId, channel);
  if (!to) {
    throw validationError([
      { path: 'notifyPhone', message: 'Save your WhatsApp number before sending a test' },
    ]);
  }
  try {
    const mode = await deliver(
      channel,
      to,
      {
        subject: 'Routinely test notification',
        text: `Reminders will arrive like this.\n\nOpen Routinely: ${config.APP_URL}`,
      },
      { userId },
    );
    return { to, mode };
  } catch (err) {
    if (err instanceof NotConfiguredError) throw new AppError(400, 'NOT_CONFIGURED', err.message);
    const message = err instanceof Error ? err.message : 'Unknown error';
    throw new AppError(502, 'SEND_FAILED', `The message could not be sent: ${message}`);
  }
}

/** The user's most recent delivery attempts, newest first. */
export async function listDeliveries(userId: string): Promise<DeliveryLogEntry[]> {
  const rows = await prisma.deliveryLog.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  return rows.map((r) => ({
    id: r.id,
    channel: r.channel,
    destination: r.destination,
    subject: r.subject,
    body: r.body,
    mode: r.mode,
    ok: r.ok,
    error: r.error,
    fromReminder: r.reminderId !== null,
    createdAt: r.createdAt.toISOString(),
  }));
}

/** Delivery log entries are kept for 30 days. */
export async function pruneDeliveryLog(now = new Date()) {
  await prisma.deliveryLog.deleteMany({
    where: { createdAt: { lt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) } },
  });
}
