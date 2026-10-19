import { describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { CSRF, signUp, useCleanDatabase, type Agent } from './helpers.js';

useCleanDatabase();

// Smallest valid file headers for each format; the server only inspects the leading bytes.
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 4, 5, 6]);

async function createTask(agent: Agent) {
  const res = await agent.post('/api/tasks').set(CSRF).send({ title: 'With pictures' });
  return res.body.data as { id: string; images: { before: string | null; after: string | null } };
}

function upload(agent: Agent, taskId: string, kind: string, body: Buffer, type = 'image/png') {
  return agent
    .put(`/api/tasks/${taskId}/images/${kind}`)
    .set(CSRF)
    .set('Content-Type', type)
    .send(body);
}

describe('task images', () => {
  it('starts with no images', async () => {
    const { agent } = await signUp();
    const task = await createTask(agent);
    expect(task.images).toEqual({ before: null, after: null });
  });

  it('stores before and after images and serves them back with their detected type', async () => {
    const { agent } = await signUp();
    const task = await createTask(agent);

    const before = await upload(agent, task.id, 'before', PNG).expect(200);
    expect(before.body.data.images.before).toMatch(
      new RegExp(`^/api/tasks/${task.id}/images/before\\?v=\\d+$`),
    );
    // The declared type is ignored: these bytes are a JPEG.
    const after = await upload(agent, task.id, 'after', JPEG, 'image/png').expect(200);
    expect(after.body.data.images.after).toBeTruthy();

    const png = await agent
      .get(before.body.data.images.before)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(png.headers['content-type']).toBe('image/png');
    expect(png.headers['cache-control']).toContain('immutable');
    expect(Buffer.compare(png.body as Buffer, PNG)).toBe(0);

    const jpeg = await agent.get(`/api/tasks/${task.id}/images/after`).expect(200);
    expect(jpeg.headers['content-type']).toBe('image/jpeg');
  });

  it('replaces an image with a new versioned URL', async () => {
    const { agent } = await signUp();
    const task = await createTask(agent);
    const first = await upload(agent, task.id, 'before', PNG).expect(200);
    await new Promise((r) => setTimeout(r, 5));
    const second = await upload(agent, task.id, 'before', JPEG).expect(200);
    expect(second.body.data.images.before).not.toBe(first.body.data.images.before);
    expect(await prisma.taskImage.count({ where: { taskId: task.id } })).toBe(1);
  });

  it('removes an image', async () => {
    const { agent } = await signUp();
    const task = await createTask(agent);
    await upload(agent, task.id, 'after', PNG).expect(200);
    const res = await agent.delete(`/api/tasks/${task.id}/images/after`).set(CSRF).expect(200);
    expect(res.body.data.images.after).toBeNull();
    await agent.get(`/api/tasks/${task.id}/images/after`).expect(404);
  });

  it('rejects files that are not images, empty bodies and unknown kinds', async () => {
    const { agent } = await signUp();
    const task = await createTask(agent);

    const html = await upload(agent, task.id, 'before', Buffer.from('<html></html>'));
    expect(html.status).toBe(415);
    expect(html.body.error.code).toBe('UNSUPPORTED_IMAGE');

    const empty = await upload(agent, task.id, 'before', Buffer.alloc(0));
    expect(empty.status).toBe(400);

    await upload(agent, task.id, 'during', PNG).expect(404);
  });

  it('rejects images over the size limit', async () => {
    const { agent } = await signUp();
    const task = await createTask(agent);
    const big = Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]);
    const res = await upload(agent, task.id, 'before', big);
    expect(res.status).toBe(413);
  });

  it("never exposes or changes another user's task images", async () => {
    const owner = await signUp();
    const other = await signUp();
    const task = await createTask(owner.agent);
    await upload(owner.agent, task.id, 'before', PNG).expect(200);

    await other.agent.get(`/api/tasks/${task.id}/images/before`).expect(404);
    await upload(other.agent, task.id, 'before', JPEG).expect(404);
    await other.agent.delete(`/api/tasks/${task.id}/images/before`).set(CSRF).expect(404);
  });

  it('requires the CSRF header to upload', async () => {
    const { agent } = await signUp();
    const task = await createTask(agent);
    await agent
      .put(`/api/tasks/${task.id}/images/before`)
      .set('Content-Type', 'image/png')
      .send(PNG)
      .expect(403);
  });

  it('deletes images together with their task', async () => {
    const { agent } = await signUp();
    const task = await createTask(agent);
    await upload(agent, task.id, 'before', PNG).expect(200);
    await agent.delete(`/api/tasks/${task.id}`).set(CSRF).expect(204);
    expect(await prisma.taskImage.count()).toBe(0);
  });
});
