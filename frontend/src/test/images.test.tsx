import type { Task } from '@planner/shared';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { makeTask, mockApi, renderApp } from './utils';

const BEFORE = '/api/tasks/x/images/before?v=1';
const AFTER = '/api/tasks/x/images/after?v=1';

const thumbnail = () => document.querySelector<HTMLImageElement>('li img');

const list = (tasks: Task[]) => ({
  data: tasks,
  meta: { page: 1, pageSize: 50, total: tasks.length, totalPages: 1 },
});

describe('task images', () => {
  it('shows the before image while open and the after image once checked', async () => {
    let current = makeTask({ title: 'Clean desk', images: { before: BEFORE, after: AFTER } });
    mockApi(
      {
        'GET /tasks': () => ({ body: list([current]) }),
        'PATCH /tasks/:id': ({ body }) => {
          const { status } = body as Pick<Task, 'status'>;
          current = { ...current, status, completedAt: status === 'COMPLETED' ? 'now' : null };
          return { body: { data: current } };
        },
      },
      { tasks: [current] },
    );
    renderApp('/tasks');

    await waitFor(() => expect(thumbnail()?.getAttribute('src')).toBe(BEFORE));

    await userEvent.click(
      await screen.findByRole('checkbox', { name: 'Mark "Clean desk" as completed' }),
    );
    await waitFor(() => expect(thumbnail()?.getAttribute('src')).toBe(AFTER));

    await userEvent.click(
      await screen.findByRole('checkbox', { name: 'Mark "Clean desk" as not completed' }),
    );
    await waitFor(() => expect(thumbnail()?.getAttribute('src')).toBe(BEFORE));
  });

  it('keeps showing the before image when a completed task has no after image', async () => {
    const task = makeTask({ status: 'COMPLETED', images: { before: BEFORE, after: null } });
    mockApi({}, { tasks: [task] });
    renderApp('/tasks');
    await waitFor(() => expect(thumbnail()?.getAttribute('src')).toBe(BEFORE));
  });

  it('uploads the chosen images after creating the task', async () => {
    const created = makeTask({ title: 'Plant tree' });
    const calls = mockApi({
      'POST /tasks': () => ({ status: 201, body: { data: created } }),
      [`PUT /tasks/${created.id}/images/before`]: () => ({ body: { data: created } }),
      [`PUT /tasks/${created.id}/images/after`]: () => ({ body: { data: created } }),
    });
    renderApp('/tasks');

    await userEvent.click((await screen.findAllByRole('button', { name: /new task/i }))[0]);
    await userEvent.type(screen.getByLabelText('Title'), 'Plant tree');
    const seed = new File(['seed'], 'seed.png', { type: 'image/png' });
    const tree = new File(['tree'], 'tree.jpg', { type: 'image/jpeg' });
    await userEvent.upload(screen.getByLabelText(/^Before image/), seed);
    await userEvent.upload(screen.getByLabelText(/^After image/), tree);
    expect(await screen.findByAltText('Before image preview')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Create task' }));

    await waitFor(() =>
      expect(calls.filter((c) => c.method === 'PUT').map((c) => c.path)).toEqual([
        `/tasks/${created.id}/images/before`,
        `/tasks/${created.id}/images/after`,
      ]),
    );
    const upload = calls.find((c) => c.method === 'PUT');
    expect(upload?.body).toBe(seed);
    expect(calls.findIndex((c) => c.method === 'POST')).toBeLessThan(
      calls.findIndex((c) => c.method === 'PUT'),
    );
  });

  it('rejects files that are not supported images before uploading', async () => {
    mockApi();
    renderApp('/tasks');
    await userEvent.click((await screen.findAllByRole('button', { name: /new task/i }))[0]);
    const pdf = new File(['%PDF'], 'notes.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText(/^Before image/), pdf, { applyAccept: false });
    expect(await screen.findByText('Use a PNG, JPEG, WebP or GIF image')).toBeInTheDocument();
  });
});
