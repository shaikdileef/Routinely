import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { CSRF, app, signUp, useCleanDatabase, type Agent } from './helpers.js';

useCleanDatabase();

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const WEBP = Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 9]);

const upload = (agent: Agent, body: Buffer, kind = 'avatar') =>
  agent.put(`/api/auth/images/${kind}`).set(CSRF).set('Content-Type', 'image/png').send(body);

describe('profile photo', () => {
  it('has no photo by default', async () => {
    const { agent } = await signUp();
    const me = await agent.get('/api/auth/me').expect(200);
    expect(me.body.data.user.avatarUrl).toBeNull();
  });

  it('uploads a photo, includes it in the session and serves it back', async () => {
    const { agent } = await signUp();
    const res = await upload(agent, PNG).expect(200);
    expect(res.body.data.avatarUrl).toMatch(/^\/api\/auth\/images\/avatar\?v=\d+$/);

    const me = await agent.get('/api/auth/me').expect(200);
    expect(me.body.data.user.avatarUrl).toBe(res.body.data.avatarUrl);

    const image = await agent.get(res.body.data.avatarUrl).expect(200);
    expect(image.headers['content-type']).toBe('image/png');
    expect(image.headers['cache-control']).toContain('immutable');
  });

  it('replaces the photo with a new version and detects its real type', async () => {
    const { agent } = await signUp();
    const first = await upload(agent, PNG).expect(200);
    await new Promise((r) => setTimeout(r, 5));
    const second = await upload(agent, WEBP).expect(200);
    expect(second.body.data.avatarUrl).not.toBe(first.body.data.avatarUrl);
    expect((await agent.get('/api/auth/images/avatar')).headers['content-type']).toBe('image/webp');
    expect(await prisma.userImage.count()).toBe(1);
  });

  it('keeps the photo when the name changes', async () => {
    const { agent } = await signUp();
    await upload(agent, PNG).expect(200);
    const res = await agent.patch('/api/auth/profile').set(CSRF).send({ name: 'New Name' });
    expect(res.body.data.name).toBe('New Name');
    expect(res.body.data.avatarUrl).not.toBeNull();
  });

  it('removes the photo', async () => {
    const { agent } = await signUp();
    await upload(agent, PNG).expect(200);
    const res = await agent.delete('/api/auth/images/avatar').set(CSRF).expect(200);
    expect(res.body.data.avatarUrl).toBeNull();
    await agent.get('/api/auth/images/avatar').expect(404);
  });

  it('rejects files that are not images, and the removed background kind', async () => {
    const { agent } = await signUp();
    const res = await upload(agent, Buffer.from('<svg onload="alert(1)"></svg>'));
    expect(res.status).toBe(415);
    await upload(agent, PNG, 'background').expect(404);
  });

  it('only ever serves the signed-in user their own photo', async () => {
    const owner = await signUp();
    const other = await signUp();
    await upload(owner.agent, PNG).expect(200);
    await other.agent.get('/api/auth/images/avatar').expect(404);
  });

  it('requires a session and the CSRF header', async () => {
    await request(app).get('/api/auth/images/avatar').expect(401);
    const { agent } = await signUp();
    await agent
      .put('/api/auth/images/avatar')
      .set('Content-Type', 'image/png')
      .send(PNG)
      .expect(403);
  });
});
