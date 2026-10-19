import { addDays, todayInTimeZone } from '@planner/shared';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CSRF, signUp, useCleanDatabase, type Agent } from './helpers.js';

useCleanDatabase();

const today = () => todayInTimeZone('UTC');

async function createTask(agent: Agent, body: Record<string, unknown>) {
  const res = await agent.post('/api/tasks').set(CSRF).send(body);
  if (res.status !== 201)
    throw new Error(`create failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data as { id: string; [k: string]: unknown };
}

describe('tasks CRUD', () => {
  it('creates a task with all fields and the user default priority', async () => {
    const { agent } = await signUp();
    await agent.patch('/api/settings').set(CSRF).send({ defaultPriority: 'HIGH' }).expect(200);

    const res = await agent
      .post('/api/tasks')
      .set(CSRF)
      .send({
        title: '  Write report ',
        description: 'Quarterly',
        dueDate: '2026-11-20',
        startDate: '2026-11-18',
        startTime: '09:00',
        endTime: '10:30',
        tags: ['Work', 'work'],
        estimatedMinutes: 90,
        notes: 'n',
      });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      title: 'Write report',
      dueDate: '2026-11-20',
      startDate: '2026-11-18',
      startTime: '09:00',
      endTime: '10:30',
      priority: 'HIGH',
      status: 'TODO',
      tags: ['work'],
      estimatedMinutes: 90,
      completedAt: null,
    });

    const fetched = await agent.get(`/api/tasks/${res.body.data.id}`).expect(200);
    expect(fetched.body.data.title).toBe('Write report');
  });

  it('validates input and reports field issues', async () => {
    const { agent } = await signUp();
    const res = await agent.post('/api/tasks').set(CSRF).send({
      title: '',
      dueDate: '2026-02-31',
      priority: 'SUPER',
      startTime: '10:00',
      endTime: '09:00',
    });
    expect(res.status).toBe(400);
    const paths = res.body.error.issues.map((i: { path: string }) => i.path);
    expect(paths).toEqual(expect.arrayContaining(['title', 'dueDate', 'priority']));
  });

  it('edits, completes, reopens and deletes a task', async () => {
    const { agent } = await signUp();
    const task = await createTask(agent, { title: 'Draft' });

    const edited = await agent
      .patch(`/api/tasks/${task.id}`)
      .set(CSRF)
      .send({ title: 'Final', priority: 'URGENT' });
    expect(edited.status).toBe(200);
    expect(edited.body.data).toMatchObject({ title: 'Final', priority: 'URGENT' });

    const done = await agent.patch(`/api/tasks/${task.id}`).set(CSRF).send({ status: 'COMPLETED' });
    expect(done.body.data.status).toBe('COMPLETED');
    expect(done.body.data.completedAt).toEqual(expect.any(String));

    const reopened = await agent.patch(`/api/tasks/${task.id}`).set(CSRF).send({ status: 'TODO' });
    expect(reopened.body.data.status).toBe('TODO');
    expect(reopened.body.data.completedAt).toBeNull();

    await agent.delete(`/api/tasks/${task.id}`).set(CSRF).expect(204);
    await agent.get(`/api/tasks/${task.id}`).expect(404);
    await agent.delete(`/api/tasks/${task.id}`).set(CSRF).expect(404);
  });

  it('re-validates timing rules against the stored task on update', async () => {
    const { agent } = await signUp();
    const task = await createTask(agent, {
      title: 'Meeting',
      startTime: '10:00',
      endTime: '11:00',
    });
    const res = await agent.patch(`/api/tasks/${task.id}`).set(CSRF).send({ endTime: '09:00' });
    expect(res.status).toBe(400);
    expect(res.body.error.issues[0].path).toBe('endTime');
  });

  it('is idempotent when the same clientRequestId is submitted twice', async () => {
    const { agent } = await signUp();
    const clientRequestId = randomUUID();
    const body = { title: 'Only once', clientRequestId };
    const [a, b] = await Promise.all([
      agent.post('/api/tasks').set(CSRF).send(body),
      agent.post('/api/tasks').set(CSRF).send(body),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 201]);
    expect(a.body.data.id).toBe(b.body.data.id);
    const list = await agent.get('/api/tasks').expect(200);
    expect(list.body.meta.total).toBe(1);
  });

  it('returns 404 for malformed ids', async () => {
    const { agent } = await signUp();
    await agent.get('/api/tasks/not-a-uuid').expect(404);
  });
});

describe('task filters, views and sorting', () => {
  it('filters by status, priority, category, search, tag and date views', async () => {
    const { agent } = await signUp();
    const t = today();
    const cat = (
      await agent.post('/api/categories').set(CSRF).send({ name: 'Work', color: '#4f46e5' })
    ).body.data;

    await createTask(agent, {
      title: 'Overdue report',
      dueDate: addDays(t, -2),
      priority: 'HIGH',
      categoryId: cat.id,
    });
    await createTask(agent, {
      title: 'Today standup',
      dueDate: t,
      priority: 'LOW',
      tags: ['meeting'],
    });
    await createTask(agent, {
      title: 'Future launch',
      dueDate: addDays(t, 5),
      priority: 'URGENT',
      status: 'IN_PROGRESS',
    });
    await createTask(agent, { title: 'Someday idea', description: 'learn rust' });
    await createTask(agent, { title: 'Old done', dueDate: addDays(t, -3), status: 'COMPLETED' });

    const titles = async (qs: string) =>
      ((await agent.get(`/api/tasks?${qs}`).expect(200)).body.data as { title: string }[]).map(
        (x) => x.title,
      );

    expect(await titles('view=overdue')).toEqual(['Overdue report']);
    expect(await titles('view=today')).toEqual(['Today standup']);
    expect(await titles('view=upcoming')).toEqual(['Future launch']);
    expect(await titles('view=nodate')).toEqual(['Someday idea']);
    expect(await titles('view=completed')).toEqual(['Old done']);
    expect(await titles('status=IN_PROGRESS')).toEqual(['Future launch']);
    expect(await titles('priority=HIGH')).toEqual(['Overdue report']);
    expect(await titles(`categoryId=${cat.id}`)).toEqual(['Overdue report']);
    expect((await titles('categoryId=none')).length).toBe(4);
    expect(await titles('search=RUST')).toEqual(['Someday idea']);
    expect(await titles('search=meeting')).toEqual(['Today standup']);
    expect(await titles('tag=meeting')).toEqual(['Today standup']);
    expect(await titles(`from=${addDays(t, -2)}&to=${t}`)).toEqual([
      'Overdue report',
      'Today standup',
    ]);

    expect((await titles('sort=priority'))[0]).toBe('Future launch');
    expect(await titles('sort=dueDate&view=open')).toEqual([
      'Overdue report',
      'Today standup',
      'Future launch',
      'Someday idea',
    ]);
  });

  it('paginates and rejects invalid query parameters', async () => {
    const { agent } = await signUp();
    for (let i = 0; i < 5; i += 1) await createTask(agent, { title: `T${i}` });
    const page = await agent.get('/api/tasks?page=2&pageSize=2&sort=createdAt').expect(200);
    expect(page.body.data).toHaveLength(2);
    expect(page.body.meta).toEqual({ page: 2, pageSize: 2, total: 5, totalPages: 3 });

    const bad = await agent.get('/api/tasks?priority=NOPE&from=yesterday');
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('uses the user timezone for "today"', async () => {
    // Pick a timezone where the local date differs from UTC right now if possible.
    const { agent } = await signUp({ timezone: 'Pacific/Kiritimati' }); // UTC+14
    const localToday = todayInTimeZone('Pacific/Kiritimati');
    await createTask(agent, { title: 'Local today', dueDate: localToday });
    const res = await agent.get('/api/tasks?view=today').expect(200);
    expect(res.body.data.map((x: { title: string }) => x.title)).toEqual(['Local today']);
  });
});

describe('task ownership', () => {
  it("prevents users from reading or changing other users' tasks", async () => {
    const alice = await signUp();
    const bob = await signUp();
    const task = await createTask(alice.agent, { title: 'Private' });

    await bob.agent.get(`/api/tasks/${task.id}`).expect(404);
    await bob.agent.patch(`/api/tasks/${task.id}`).set(CSRF).send({ title: 'Hacked' }).expect(404);
    await bob.agent.delete(`/api/tasks/${task.id}`).set(CSRF).expect(404);
    expect((await bob.agent.get('/api/tasks').expect(200)).body.meta.total).toBe(0);

    const still = await alice.agent.get(`/api/tasks/${task.id}`).expect(200);
    expect(still.body.data.title).toBe('Private');
  });

  it("rejects assigning a task to another user's category", async () => {
    const alice = await signUp();
    const bob = await signUp();
    const cat = (
      await alice.agent.post('/api/categories').set(CSRF).send({ name: 'Mine', color: '#4f46e5' })
    ).body.data;
    const res = await bob.agent
      .post('/api/tasks')
      .set(CSRF)
      .send({ title: 'x', categoryId: cat.id });
    expect(res.status).toBe(400);
    expect(res.body.error.issues[0].path).toBe('categoryId');
  });
});
