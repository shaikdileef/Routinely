import { addDays, todayInTimeZone } from '@planner/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { testOutbox } from '../src/notifications/index.js';
import { processDueReminders } from '../src/services/reminderService.js';
import { CSRF, signUp, useCleanDatabase, type Agent } from './helpers.js';

useCleanDatabase();
beforeEach(() => {
  testOutbox.length = 0;
});

const today = () => todayInTimeZone('UTC');
const DAY_BEFORE = { type: 'relative', daysBefore: 1, time: '08:00' } as const;
const WEEK_BEFORE = { type: 'relative', daysBefore: 7, time: '08:00' } as const;

async function createTask(agent: Agent, body: Record<string, unknown>) {
  const res = await agent.post('/api/tasks').set(CSRF).send(body);
  return res.body.data as { id: string };
}

const setReminders = (agent: Agent, taskId: string, reminders: unknown[]) =>
  agent.put(`/api/tasks/${taskId}/reminders`).set(CSRF).send({ reminders });

const statuses = async (taskId: string) =>
  (await prisma.reminder.findMany({ where: { taskId }, orderBy: { sendAt: 'asc' } })).map(
    (r) => `${r.specKey}/${r.channel}:${r.status}`,
  );

describe('task reminders', () => {
  it('creates reminders before the due date, in the user timezone, without duplicates', async () => {
    const { agent } = await signUp({ timezone: 'Asia/Kolkata' });
    const exam = await createTask(agent, { title: 'Exam', dueDate: addDays(today(), 10) });

    const res = await setReminders(agent, exam.id, [DAY_BEFORE, WEEK_BEFORE, DAY_BEFORE]).expect(
      200,
    );
    expect(res.body.data).toHaveLength(2);
    // 08:00 in Kolkata is 02:30 UTC.
    expect(res.body.data[0].sendAt).toBe(`${addDays(today(), 3)}T02:30:00.000Z`);
    expect(res.body.data[0].deliveries).toEqual([
      { channel: 'EMAIL', status: 'PENDING', error: null },
    ]);

    const listed = await agent.get(`/api/tasks/${exam.id}/reminders`).expect(200);
    expect(listed.body.data.map((r: { key: string }) => r.key)).toEqual([
      'relative:7:08:00',
      'relative:1:08:00',
    ]);
  });

  it('rejects relative reminders without a due date and times in the past', async () => {
    const { agent } = await signUp();
    const undated = await createTask(agent, { title: 'Someday' });
    const noDue = await setReminders(agent, undated.id, [DAY_BEFORE]);
    expect(noDue.status).toBe(400);
    expect(noDue.body.error.message).toMatch(/due date/);

    const past = await setReminders(agent, undated.id, [
      { type: 'custom', date: addDays(today(), -1), time: '09:00' },
    ]);
    expect(past.status).toBe(400);
    expect(past.body.error.message).toMatch(/already passed/);
  });

  it('cancels pending reminders when the task is completed and restores them when reopened', async () => {
    const { agent } = await signUp();
    const task = await createTask(agent, { title: 'Report', dueDate: addDays(today(), 5) });
    await setReminders(agent, task.id, [DAY_BEFORE]).expect(200);

    await agent.patch(`/api/tasks/${task.id}`).set(CSRF).send({ status: 'COMPLETED' }).expect(200);
    expect(await statuses(task.id)).toEqual(['relative:1:08:00/EMAIL:CANCELLED']);

    await agent.patch(`/api/tasks/${task.id}`).set(CSRF).send({ status: 'TODO' }).expect(200);
    expect(await statuses(task.id)).toEqual(['relative:1:08:00/EMAIL:PENDING']);
  });

  it('moves relative reminders when the due date changes', async () => {
    const { agent } = await signUp();
    const task = await createTask(agent, { title: 'Trip', dueDate: addDays(today(), 5) });
    await setReminders(agent, task.id, [DAY_BEFORE]).expect(200);

    await agent
      .patch(`/api/tasks/${task.id}`)
      .set(CSRF)
      .send({ dueDate: addDays(today(), 9) })
      .expect(200);
    const [row] = await prisma.reminder.findMany({ where: { taskId: task.id } });
    expect(row.sendAt.toISOString()).toBe(`${addDays(today(), 8)}T08:00:00.000Z`);
  });

  it('deletes reminders together with their task', async () => {
    const { agent } = await signUp();
    const task = await createTask(agent, { title: 'Temp', dueDate: addDays(today(), 5) });
    await setReminders(agent, task.id, [DAY_BEFORE]).expect(200);
    await agent.delete(`/api/tasks/${task.id}`).set(CSRF).expect(204);
    expect(await prisma.reminder.count()).toBe(0);
  });

  it("never exposes another user's reminders", async () => {
    const owner = await signUp();
    const other = await signUp();
    const task = await createTask(owner.agent, { title: 'Private', dueDate: addDays(today(), 5) });
    await other.agent.get(`/api/tasks/${task.id}/reminders`).expect(404);
    await setReminders(other.agent, task.id, [DAY_BEFORE]).expect(404);
  });
});

describe('sending reminders', () => {
  /** Makes a pending reminder that fell due `minutesAgo` minutes before now. */
  async function dueReminder(agent: Agent, minutesAgo: number) {
    const task = await createTask(agent, { title: 'Exam', dueDate: addDays(today(), 5) });
    await setReminders(agent, task.id, [DAY_BEFORE]).expect(200);
    await prisma.reminder.updateMany({
      where: { taskId: task.id },
      data: { sendAt: new Date(Date.now() - minutesAgo * 60_000) },
    });
    return task;
  }

  it('sends a due reminder exactly once, to the account email by default', async () => {
    const { agent, email } = await signUp();
    const task = await dueReminder(agent, 1);

    expect(await processDueReminders()).toEqual({ sent: 1, failed: 0, cancelled: 0 });
    expect(await processDueReminders()).toEqual({ sent: 0, failed: 0, cancelled: 0 });

    expect(testOutbox).toHaveLength(1);
    expect(testOutbox[0]).toMatchObject({ channel: 'EMAIL', to: email });
    expect(testOutbox[0].message.subject).toBe('Reminder: Exam');
    expect(testOutbox[0].message.text).toMatch(/due on .* \(in 5 days\)/);
    expect(await statuses(task.id)).toEqual(['relative:1:08:00/EMAIL:SENT']);
  });

  it('sends on time, not early, when the database server is not on UTC', async () => {
    const [{ tz }] = await prisma.$queryRaw<
      { tz: string }[]
    >`SELECT current_setting('TimeZone') AS tz`;
    expect(tz).toBe('Asia/Kolkata'); // set in globalSetup
    const { agent } = await signUp();
    const task = await dueReminder(agent, 1);
    const sendAt = new Date(Date.now() + 2 * 60_000);
    await prisma.reminder.updateMany({ where: { taskId: task.id }, data: { sendAt } });

    const early = await processDueReminders(new Date(sendAt.getTime() - 60_000));
    expect(early.sent).toBe(0);
    const ranAt = new Date(sendAt.getTime() + 1000);
    expect((await processDueReminders(ranAt)).sent).toBe(1);
    const [row] = await prisma.reminder.findMany({ where: { taskId: task.id } });
    expect(row.attemptedAt?.toISOString()).toBe(ranAt.toISOString());
  });

  it('does not send for completed tasks, and marks reminders over 12 hours late as missed', async () => {
    const { agent } = await signUp();
    const done = await dueReminder(agent, 1);
    await prisma.task.update({ where: { id: done.id }, data: { status: 'COMPLETED' } });
    const stale = await dueReminder(agent, 13 * 60);

    expect(await processDueReminders()).toEqual({ sent: 0, failed: 1, cancelled: 1 });
    expect(testOutbox).toHaveLength(0);
    const [missed] = await prisma.reminder.findMany({ where: { taskId: stale.id } });
    expect(missed.status).toBe('FAILED');
    expect(missed.error).toMatch(/Missed/);
  });

  it('adds WhatsApp deliveries once a phone number is saved and WhatsApp is turned on', async () => {
    const { agent } = await signUp();
    const task = await createTask(agent, { title: 'Exam', dueDate: addDays(today(), 5) });
    await setReminders(agent, task.id, [DAY_BEFORE]).expect(200);

    const noPhone = await agent.patch('/api/settings').set(CSRF).send({ whatsappReminders: true });
    expect(noPhone.status).toBe(400);
    expect(noPhone.body.error.issues[0].path).toBe('notifyPhone');

    await agent
      .patch('/api/settings')
      .set(CSRF)
      .send({ notifyPhone: '+91 98765 43210', whatsappReminders: true, emailReminders: false })
      .expect(200);
    expect(await statuses(task.id)).toEqual(['relative:1:08:00/WHATSAPP:PENDING']);

    await prisma.reminder.updateMany({ where: { taskId: task.id }, data: { sendAt: new Date() } });
    await processDueReminders();
    expect(testOutbox[0]).toMatchObject({ channel: 'WHATSAPP', to: '+919876543210' });
  });

  it('sends a test notification to the chosen channel', async () => {
    const { agent, email } = await signUp();
    await agent
      .patch('/api/settings')
      .set(CSRF)
      .send({ notifyEmail: 'Alerts@Example.com' })
      .expect(200);
    const res = await agent
      .post('/api/settings/notifications/test')
      .set(CSRF)
      .send({ channel: 'EMAIL' })
      .expect(200);
    expect(res.body.data.to).toBe('alerts@example.com');
    expect(testOutbox[0].to).not.toBe(email);

    const noPhone = await agent
      .post('/api/settings/notifications/test')
      .set(CSRF)
      .send({ channel: 'WHATSAPP' });
    expect(noPhone.status).toBe(400);
  });

  it('records every delivery in the user’s own delivery log', async () => {
    const { agent, email } = await signUp();
    await dueReminder(agent, 1);
    await processDueReminders();
    const test = await agent
      .post('/api/settings/notifications/test')
      .set(CSRF)
      .send({ channel: 'EMAIL' })
      .expect(200);
    expect(test.body.data.mode).toBe('preview');

    const log = await agent.get('/api/settings/notifications/log').expect(200);
    expect(log.body.data).toHaveLength(2);
    const [latest, reminder] = log.body.data;
    expect(latest).toMatchObject({
      subject: 'Routinely test notification',
      fromReminder: false,
    });
    expect(reminder).toMatchObject({
      channel: 'EMAIL',
      destination: email,
      subject: 'Reminder: Exam',
      mode: 'PREVIEW',
      ok: true,
      error: null,
      fromReminder: true,
    });

    const other = await signUp();
    const otherLog = await other.agent.get('/api/settings/notifications/log').expect(200);
    expect(otherLog.body.data).toEqual([]);
  });
});

describe('daily tasks (habits)', () => {
  it("completes a daily task for today in the user's timezone, once per day", async () => {
    const { agent } = await signUp({ timezone: 'Pacific/Kiritimati' });
    const localToday = todayInTimeZone('Pacific/Kiritimati');
    const created = await agent
      .post('/api/habits')
      .set(CSRF)
      .send({ name: 'Drink water', color: '#0891b2', frequency: 'DAILY' })
      .expect(201);
    const id = created.body.data.id as string;

    const ticked = await agent
      .put(`/api/habits/${id}/completions/${localToday}`)
      .set(CSRF)
      .expect(200);
    expect(ticked.body.data.stats).toMatchObject({
      completedToday: true,
      currentStreak: 1,
      totalCompletions: 1,
    });
    // Ticking again is harmless; tomorrow cannot be ticked in advance.
    await agent.put(`/api/habits/${id}/completions/${localToday}`).set(CSRF).expect(200);
    expect(await prisma.habitCompletion.count()).toBe(1);
    await agent
      .put(`/api/habits/${id}/completions/${addDays(localToday, 1)}`)
      .set(CSRF)
      .expect(400);
  });
});
