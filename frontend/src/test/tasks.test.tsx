import { addDays } from '@planner/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { makeTask, mockApi, renderApp, today } from './utils';

describe('task interactions', () => {
  it('marks a task complete only after the server confirms', async () => {
    const task = makeTask({ title: 'Write report', dueDate: today() });
    let resolve!: () => void;
    const gate = new Promise<void>((r) => (resolve = r));
    const calls = mockApi(
      {
        'PATCH /tasks/:id': async ({ body }) => {
          await gate;
          return {
            body: { data: { ...task, ...(body as object), completedAt: new Date().toISOString() } },
          };
        },
      },
      { tasks: [task] },
    );
    renderApp('/tasks');

    const checkbox = await screen.findByRole('checkbox', {
      name: 'Mark "Write report" as completed',
    });
    await userEvent.click(checkbox);
    // Not optimistic: still unchecked and disabled while the request is pending.
    expect(checkbox).not.toBeChecked();
    expect(checkbox).toBeDisabled();

    resolve();
    await waitFor(() => expect(calls.some((c) => c.method === 'PATCH')).toBe(true));
    const patch = calls.find((c) => c.method === 'PATCH');
    expect(patch?.path).toBe(`/tasks/${task.id}`);
    expect(patch?.body).toEqual({ status: 'COMPLETED' });
  });

  it('shows an error and keeps the task unchanged when saving fails', async () => {
    const task = makeTask({ title: 'Flaky' });
    mockApi(
      {
        'PATCH /tasks/:id': () => ({
          status: 500,
          body: { error: { code: 'INTERNAL_ERROR', message: 'Database unavailable' } },
        }),
      },
      { tasks: [task] },
    );
    renderApp('/tasks');
    const checkbox = await screen.findByRole('checkbox', { name: 'Mark "Flaky" as completed' });
    await userEvent.click(checkbox);
    expect(await screen.findByText('Database unavailable')).toBeInTheDocument();
    expect(checkbox).not.toBeChecked();
  });

  it('asks for confirmation before deleting', async () => {
    const task = makeTask({ title: 'Delete me' });
    const calls = mockApi({ 'DELETE /tasks/:id': () => ({ status: 204 }) }, { tasks: [task] });
    renderApp('/tasks');

    await userEvent.click(await screen.findByRole('button', { name: 'Delete "Delete me"' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete task?' });
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);

    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete task' }));
    await waitFor(() =>
      expect(calls.some((c) => c.method === 'DELETE' && c.path === `/tasks/${task.id}`)).toBe(true),
    );
  });

  it('shows overdue indicators', async () => {
    mockApi({}, { tasks: [makeTask({ title: 'Late', dueDate: addDays(today(), -2) })] });
    renderApp('/tasks');
    expect(await screen.findByText(/Overdue ·/)).toBeInTheDocument();
  });

  it('syncs priority and status filters with the API query', async () => {
    const calls = mockApi();
    renderApp('/tasks');
    await userEvent.selectOptions(
      await screen.findByRole('combobox', { name: 'Priority filter' }),
      'HIGH',
    );
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Status filter' }),
      'IN_PROGRESS',
    );
    await waitFor(() =>
      expect(
        calls.some(
          (c) =>
            c.path === '/tasks' &&
            c.query.get('priority') === 'HIGH' &&
            c.query.get('status') === 'IN_PROGRESS',
        ),
      ).toBe(true),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
    await waitFor(() => {
      const last = calls.filter((c) => c.path === '/tasks').at(-1);
      expect(last?.query.get('priority')).toBeNull();
    });
  });
});

describe('task form', () => {
  it('validates before submitting', async () => {
    const calls = mockApi();
    renderApp('/tasks');
    await userEvent.click(
      await screen.findAllByRole('button', { name: 'New task' }).then((b) => b[0]),
    );
    const dialog = await screen.findByRole('dialog', { name: 'New task' });

    await userEvent.click(within(dialog).getByRole('button', { name: 'Create task' }));
    expect(await within(dialog).findByText('Title is required')).toBeInTheDocument();

    await userEvent.type(within(dialog).getByLabelText('Title'), 'Meeting');
    await userEvent.click(within(dialog).getByRole('button', { name: /More options/ }));
    await userEvent.type(within(dialog).getByLabelText(/Start time/), '10:00');
    await userEvent.type(within(dialog).getByLabelText(/End time/), '09:00');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create task' }));
    expect(
      await within(dialog).findByText('End time must be after the start time'),
    ).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('creates a task once with an idempotency key, even when double-clicked', async () => {
    const calls = mockApi({
      'POST /tasks': async ({ body }) => {
        await new Promise((r) => setTimeout(r, 30));
        return { status: 201, body: { data: makeTask(body as object) } };
      },
    });
    renderApp('/tasks');
    await userEvent.click(
      await screen.findAllByRole('button', { name: 'New task' }).then((b) => b[0]),
    );
    const dialog = await screen.findByRole('dialog', { name: 'New task' });
    await userEvent.type(within(dialog).getByLabelText('Title'), 'Ship it');
    await userEvent.selectOptions(within(dialog).getByLabelText('Priority'), 'URGENT');
    await userEvent.click(within(dialog).getByRole('button', { name: /More options/ }));
    await userEvent.type(within(dialog).getByLabelText(/Tags/), 'work, Launch');

    const submit = within(dialog).getByRole('button', { name: 'Create task' });
    await userEvent.dblClick(submit);
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'New task' })).not.toBeInTheDocument(),
    );

    const posts = calls.filter((c) => c.method === 'POST' && c.path === '/tasks');
    expect(posts).toHaveLength(1);
    expect(posts[0].body).toMatchObject({
      title: 'Ship it',
      priority: 'URGENT',
      tags: ['work', 'Launch'],
      clientRequestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });
  });

  it('shows server-side field errors', async () => {
    mockApi({
      'POST /tasks': () => ({
        status: 400,
        body: {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Category not found',
            issues: [{ path: 'categoryId', message: 'Category not found' }],
          },
        },
      }),
    });
    renderApp('/tasks');
    await userEvent.click(
      await screen.findAllByRole('button', { name: 'New task' }).then((b) => b[0]),
    );
    const dialog = await screen.findByRole('dialog', { name: 'New task' });
    await userEvent.type(within(dialog).getByLabelText('Title'), 'x');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create task' }));
    expect(await within(dialog).findAllByText('Category not found')).not.toHaveLength(0);
    expect(screen.getByRole('dialog', { name: 'New task' })).toBeInTheDocument();
  });

  it('keeps extra fields under "More options" unless the task already uses them', async () => {
    const tagged = makeTask({ title: 'Tagged', tags: ['work'] });
    mockApi({}, { tasks: [tagged] });
    renderApp('/tasks');

    await userEvent.click(
      await screen.findAllByRole('button', { name: 'New task' }).then((b) => b[0]),
    );
    let dialog = await screen.findByRole('dialog', { name: 'New task' });
    expect(within(dialog).queryByLabelText(/Tags/)).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText(/Due date/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await userEvent.click(await screen.findByRole('button', { name: 'Edit "Tagged"' }));
    dialog = await screen.findByRole('dialog', { name: 'Edit task' });
    expect(within(dialog).getByLabelText(/Tags/)).toHaveValue('work');
  });
});
