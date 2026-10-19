import type { SystemCheck } from '@planner/shared';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { schedulerState } from '../src/reminderScheduler.js';
import { systemProbes } from '../src/services/systemService.js';
import { app, signUp, useCleanDatabase } from './helpers.js';

useCleanDatabase();
afterEach(() => {
  vi.restoreAllMocks();
  schedulerState.running = false;
  schedulerState.lastRunAt = null;
});

const byKey = (checks: SystemCheck[]) => Object.fromEntries(checks.map((c) => [c.key, c]));

describe('system checks', () => {
  it('requires a signed-in user', async () => {
    await request(app).get('/api/system/checks').expect(401);
  });

  it('reports each service, testing only the ones that have keys', async () => {
    const spotify = vi.spyOn(systemProbes, 'spotify').mockResolvedValue();
    const email = vi.spyOn(systemProbes, 'email');
    schedulerState.running = true;
    schedulerState.lastRunAt = new Date();
    const { agent } = await signUp();

    const res = await agent.get('/api/system/checks').expect(200);
    const checks = byKey(res.body.data);
    expect(Object.keys(checks)).toEqual(['database', 'scheduler', 'email', 'whatsapp', 'spotify']);
    expect(checks.database.status).toBe('ok');
    expect(checks.scheduler.status).toBe('ok');
    // The test environment has no SMTP or Twilio keys, only fake Spotify ones.
    expect(checks.email).toMatchObject({
      status: 'missing',
      fix: expect.stringMatching(/SMTP_PASS/),
    });
    expect(checks.whatsapp.status).toBe('missing');
    expect(checks.spotify.status).toBe('ok');
    expect(spotify).toHaveBeenCalledOnce();
    expect(email).not.toHaveBeenCalled();
  });

  it('explains rejected keys and a stopped scheduler', async () => {
    vi.spyOn(systemProbes, 'spotify').mockRejectedValue(new Error('Invalid client'));
    const { agent } = await signUp();

    const checks = byKey((await agent.get('/api/system/checks').expect(200)).body.data);
    expect(checks.spotify).toMatchObject({ status: 'error', detail: 'Invalid client' });
    expect(checks.scheduler).toMatchObject({
      status: 'error',
      fix: expect.stringMatching(/start:dev/),
    });
  });
});
