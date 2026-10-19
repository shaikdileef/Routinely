import request from 'supertest';
import { afterAll, beforeEach } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db.js';

export const app = createApp();
export const CSRF = { 'X-Requested-With': 'planner' };

export function useCleanDatabase() {
  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "HabitCompletion", "Habit", "Task", "Category", "UserSettings", "User" CASCADE',
    );
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });
}

let counter = 0;

/** Registers a fresh user and returns a cookie-carrying agent for them. */
export async function signUp(overrides: { timezone?: string } = {}) {
  counter += 1;
  const agent = request.agent(app);
  const email = `user${counter}-${Date.now()}@example.com`;
  const res = await agent
    .post('/api/auth/register')
    .set(CSRF)
    .send({
      name: `User ${counter}`,
      email,
      password: 'correct-horse-battery',
      timezone: overrides.timezone ?? 'UTC',
    });
  if (res.status !== 201)
    throw new Error(`sign up failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { agent, email, user: res.body.data.user as { id: string } };
}

export type Agent = Awaited<ReturnType<typeof signUp>>['agent'];
