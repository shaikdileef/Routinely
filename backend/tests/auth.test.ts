import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { app, CSRF, signUp, useCleanDatabase } from './helpers.js';

useCleanDatabase();

describe('auth', () => {
  it('registers, stores a hashed password and creates default settings', async () => {
    const res = await request(app).post('/api/auth/register').set(CSRF).send({
      name: 'Ada',
      email: 'Ada@Example.com',
      password: 'longenough',
      timezone: 'Asia/Kolkata',
    });

    expect(res.status).toBe(201);
    expect(res.body.data.user).toMatchObject({ name: 'Ada', email: 'ada@example.com' });
    expect(res.body.data.user.passwordHash).toBeUndefined();
    expect(res.body.data.settings).toMatchObject({
      timezone: 'Asia/Kolkata',
      theme: 'SYSTEM',
      weekStartsOn: 1,
    });
    expect(res.headers['set-cookie']?.[0]).toMatch(/planner_session=.*HttpOnly/i);

    const row = await prisma.user.findUniqueOrThrow({ where: { email: 'ada@example.com' } });
    expect(row.passwordHash).not.toContain('longenough');
    expect(row.passwordHash).toMatch(/^\$2[aby]\$/);
  });

  it('rejects duplicate emails and invalid input', async () => {
    const body = { name: 'A', email: 'dup@example.com', password: 'longenough' };
    await request(app).post('/api/auth/register').set(CSRF).send(body).expect(201);
    const dup = await request(app).post('/api/auth/register').set(CSRF).send(body);
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('EMAIL_TAKEN');

    const bad = await request(app)
      .post('/api/auth/register')
      .set(CSRF)
      .send({ name: '', email: 'nope', password: 'short' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');
    expect(bad.body.error.issues.map((i: { path: string }) => i.path)).toEqual(
      expect.arrayContaining(['name', 'email', 'password']),
    );
  });

  it('logs in with correct credentials only', async () => {
    const { email } = await signUp();
    const wrong = await request(app)
      .post('/api/auth/login')
      .set(CSRF)
      .send({ email, password: 'wrong-password' });
    expect(wrong.status).toBe(401);
    expect(wrong.body.error.message).toBe('Invalid email or password');

    const unknown = await request(app)
      .post('/api/auth/login')
      .set(CSRF)
      .send({ email: 'ghost@example.com', password: 'whatever1' });
    expect(unknown.status).toBe(401);

    const agent = request.agent(app);
    await agent
      .post('/api/auth/login')
      .set(CSRF)
      .send({ email, password: 'correct-horse-battery' })
      .expect(200);
    await agent.get('/api/auth/me').expect(200);
  });

  it('protects routes and supports logout', async () => {
    await request(app).get('/api/tasks').expect(401);
    await request(app).get('/api/auth/me').expect(401);
    await request(app)
      .get('/api/tasks')
      .set('Cookie', 'planner_session=forged.token.value')
      .expect(401);

    const { agent } = await signUp();
    await agent.get('/api/tasks').expect(200);
    await agent.post('/api/auth/logout').set(CSRF).expect(204);
    await agent.get('/api/tasks').expect(401);
  });

  it('rejects state-changing requests without the CSRF header', async () => {
    const { agent } = await signUp();
    const res = await agent.post('/api/tasks').send({ title: 'x' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_REJECTED');
  });

  it('changing the password revokes other sessions', async () => {
    const { agent, email } = await signUp();
    const other = request.agent(app);
    await other
      .post('/api/auth/login')
      .set(CSRF)
      .send({ email, password: 'correct-horse-battery' })
      .expect(200);

    await agent
      .post('/api/auth/password')
      .set(CSRF)
      .send({ currentPassword: 'wrong', newPassword: 'new-password-1' })
      .expect(400);
    await agent
      .post('/api/auth/password')
      .set(CSRF)
      .send({ currentPassword: 'correct-horse-battery', newPassword: 'new-password-1' })
      .expect(204);

    await agent.get('/api/auth/me').expect(200);
    await other.get('/api/auth/me').expect(401);
  });

  it('returns JSON errors for malformed bodies and unknown routes', async () => {
    const bad = await request(app)
      .post('/api/auth/login')
      .set(CSRF)
      .set('Content-Type', 'application/json')
      .send('{"email":');
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('INVALID_JSON');

    const missing = await request(app).get('/api/nope');
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('NOT_FOUND');
  });
});
