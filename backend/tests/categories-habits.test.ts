import { addDays, dayOfWeek, todayInTimeZone } from '@planner/shared';
import { describe, expect, it } from 'vitest';
import { CSRF, signUp, useCleanDatabase } from './helpers.js';

useCleanDatabase();

describe('categories', () => {
  it('creates, renames, recolors and reports counts', async () => {
    const { agent } = await signUp();
    const created = await agent
      .post('/api/categories')
      .set(CSRF)
      .send({ name: 'Work', color: '#4F46E5' });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ name: 'Work', color: '#4f46e5', taskCount: 0 });
    const id = created.body.data.id;

    await agent.post('/api/tasks').set(CSRF).send({ title: 'a', categoryId: id }).expect(201);
    await agent
      .post('/api/tasks')
      .set(CSRF)
      .send({ title: 'b', categoryId: id, status: 'COMPLETED' })
      .expect(201);

    const renamed = await agent
      .patch(`/api/categories/${id}`)
      .set(CSRF)
      .send({ name: 'Job', color: '#059669' });
    expect(renamed.body.data).toMatchObject({
      name: 'Job',
      color: '#059669',
      taskCount: 2,
      completedCount: 1,
    });

    const dup = await agent
      .post('/api/categories')
      .set(CSRF)
      .send({ name: 'job', color: '#059669' });
    expect(dup.status).toBe(409);
  });

  it('never silently deletes tasks when deleting a category', async () => {
    const { agent } = await signUp();
    const work = (
      await agent.post('/api/categories').set(CSRF).send({ name: 'Work', color: '#4f46e5' })
    ).body.data;
    const home = (
      await agent.post('/api/categories').set(CSRF).send({ name: 'Home', color: '#059669' })
    ).body.data;
    const task = (
      await agent.post('/api/tasks').set(CSRF).send({ title: 'keep me', categoryId: work.id })
    ).body.data;

    const blocked = await agent.delete(`/api/categories/${work.id}`).set(CSRF);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toMatchObject({
      code: 'CATEGORY_HAS_TASKS',
      details: { taskCount: 1 },
    });

    const moved = await agent.delete(`/api/categories/${work.id}?reassignTo=${home.id}`).set(CSRF);
    expect(moved.status).toBe(200);
    expect(moved.body.data.movedTasks).toBe(1);
    expect((await agent.get(`/api/tasks/${task.id}`)).body.data.category.name).toBe('Home');

    await agent.delete(`/api/categories/${home.id}?reassignTo=none`).set(CSRF).expect(200);
    const after = (await agent.get(`/api/tasks/${task.id}`).expect(200)).body.data;
    expect(after.categoryId).toBeNull();
  });

  it('isolates categories between users', async () => {
    const alice = await signUp();
    const bob = await signUp();
    const cat = (
      await alice.agent.post('/api/categories').set(CSRF).send({ name: 'A', color: '#4f46e5' })
    ).body.data;
    await bob.agent.patch(`/api/categories/${cat.id}`).set(CSRF).send({ name: 'B' }).expect(404);
    await bob.agent.delete(`/api/categories/${cat.id}?reassignTo=none`).set(CSRF).expect(404);
    expect((await bob.agent.get('/api/categories')).body.data).toEqual([]);
  });
});

describe('habits', () => {
  it('records completions and computes streaks', async () => {
    const { agent } = await signUp();
    const today = todayInTimeZone('UTC');
    const habit = (
      await agent
        .post('/api/habits')
        .set(CSRF)
        .send({ name: 'Read', color: '#4f46e5', frequency: 'DAILY' })
    ).body.data;
    expect(habit.stats.currentStreak).toBe(0);

    for (const d of [addDays(today, -2), addDays(today, -1), today]) {
      await agent.put(`/api/habits/${habit.id}/completions/${d}`).set(CSRF).expect(200);
    }
    // marking twice is idempotent
    const again = await agent
      .put(`/api/habits/${habit.id}/completions/${today}`)
      .set(CSRF)
      .expect(200);
    expect(again.body.data.stats).toMatchObject({
      currentStreak: 3,
      longestStreak: 3,
      completedToday: true,
    });
    expect(again.body.data.completions).toHaveLength(3);

    const unmarked = await agent
      .delete(`/api/habits/${habit.id}/completions/${addDays(today, -1)}`)
      .set(CSRF);
    expect(unmarked.body.data.stats).toMatchObject({ currentStreak: 1, longestStreak: 1 });
  });

  it('rejects future and unscheduled dates', async () => {
    const { agent } = await signUp();
    const today = todayInTimeZone('UTC');
    const offDay = (dayOfWeek(today) + 1) % 7;
    const habit = (
      await agent
        .post('/api/habits')
        .set(CSRF)
        .send({
          name: 'Gym',
          color: '#4f46e5',
          frequency: 'SPECIFIC_DAYS',
          daysOfWeek: [dayOfWeek(today)],
        })
    ).body.data;

    const future = await agent
      .put(`/api/habits/${habit.id}/completions/${addDays(today, 7)}`)
      .set(CSRF);
    expect(future.status).toBe(400);

    const unscheduledDate = addDays(today, -((dayOfWeek(today) - offDay + 7) % 7 || 7));
    const unscheduled = await agent
      .put(`/api/habits/${habit.id}/completions/${unscheduledDate}`)
      .set(CSRF);
    expect(unscheduled.status).toBe(400);

    await agent.put(`/api/habits/${habit.id}/completions/2026-02-30`).set(CSRF).expect(400);
  });

  it('validates habit input and isolates habits between users', async () => {
    const alice = await signUp();
    const bob = await signUp();
    await alice.agent
      .post('/api/habits')
      .set(CSRF)
      .send({ name: 'X', color: '#4f46e5', frequency: 'SPECIFIC_DAYS', daysOfWeek: [] })
      .expect(400);
    const habit = (
      await alice.agent
        .post('/api/habits')
        .set(CSRF)
        .send({ name: 'Meditate', color: '#4f46e5', frequency: 'DAILY' })
    ).body.data;
    await bob.agent
      .put(`/api/habits/${habit.id}/completions/${todayInTimeZone('UTC')}`)
      .set(CSRF)
      .expect(404);
    await bob.agent.delete(`/api/habits/${habit.id}`).set(CSRF).expect(404);
    await alice.agent.delete(`/api/habits/${habit.id}`).set(CSRF).expect(204);
  });
});

describe('dashboard', () => {
  it('computes statistics from stored tasks', async () => {
    const { agent } = await signUp();
    const today = todayInTimeZone('UTC');
    const empty = (await agent.get('/api/dashboard').expect(200)).body.data;
    expect(empty.totals).toEqual({ all: 0, open: 0, completed: 0 });

    await agent
      .post('/api/tasks')
      .set(CSRF)
      .send({ title: 'a', dueDate: today, priority: 'URGENT' });
    await agent
      .post('/api/tasks')
      .set(CSRF)
      .send({ title: 'b', dueDate: today, status: 'COMPLETED' });
    await agent
      .post('/api/tasks')
      .set(CSRF)
      .send({ title: 'c', dueDate: addDays(today, -1) });
    await agent
      .post('/api/tasks')
      .set(CSRF)
      .send({ title: 'd', dueDate: addDays(today, 2) });

    const s = (await agent.get('/api/dashboard').expect(200)).body.data;
    expect(s.totals).toEqual({ all: 4, open: 3, completed: 1 });
    expect(s.todayProgress).toEqual({ total: 2, completed: 1, remaining: 1, percent: 50 });
    expect(s.overdueCount).toBe(1);
    expect(s.completedToday).toBe(1);
    expect(s.priorityBreakdown.URGENT).toBe(1);
    expect(s.upcomingTasks.map((t: { title: string }) => t.title)).toEqual(['d']);
    expect(s.weekly[6]).toEqual({ date: today, completed: 1 });
  });
});

describe('settings', () => {
  it('validates and persists settings', async () => {
    const { agent } = await signUp();
    await agent.patch('/api/settings').set(CSRF).send({ timezone: 'Not/AZone' }).expect(400);
    await agent.patch('/api/settings').set(CSRF).send({ weekStartsOn: 3 }).expect(400);
    const ok = await agent
      .patch('/api/settings')
      .set(CSRF)
      .send({ theme: 'DARK', weekStartsOn: 0, timezone: 'Europe/Berlin' })
      .expect(200);
    expect(ok.body.data).toMatchObject({
      theme: 'DARK',
      weekStartsOn: 0,
      timezone: 'Europe/Berlin',
    });
    expect((await agent.get('/api/auth/me')).body.data.settings.theme).toBe('DARK');
  });

  it('defaults to the Lavender colour theme and saves a new one', async () => {
    const { agent } = await signUp();
    expect((await agent.get('/api/auth/me')).body.data.settings.colorTheme).toBe('LAVENDER');

    await agent.patch('/api/settings').set(CSRF).send({ colorTheme: 'NEON' }).expect(400);
    const res = await agent
      .patch('/api/settings')
      .set(CSRF)
      .send({ colorTheme: 'AURORA' })
      .expect(200);
    expect(res.body.data).toMatchObject({ colorTheme: 'AURORA', theme: 'SYSTEM' });
    expect((await agent.get('/api/auth/me')).body.data.settings.colorTheme).toBe('AURORA');
  });
});
