import { addDays, type Habit } from '@planner/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { makeTask, mockApi, renderApp, session, today } from './utils';

function makeHabit(overrides: Partial<Habit> & { id: string; name: string }): Habit {
  return {
    description: null,
    color: '#0891b2',
    frequency: 'DAILY',
    daysOfWeek: [],
    startDate: addDays(today(), -10),
    createdAt: '2026-01-01T00:00:00.000Z',
    completions: [],
    stats: {
      currentStreak: 0,
      longestStreak: 0,
      scheduledToday: true,
      completedToday: false,
      week: { completed: 0, scheduled: 7 },
      month: { completed: 0, scheduled: 30 },
      totalCompletions: 0,
    },
    ...overrides,
  };
}

const WATER = '00000000-0000-4000-8000-00000000a001';
const READ = '00000000-0000-4000-8000-00000000a002';

describe("dashboard: today's daily tasks", () => {
  it('lists daily tasks due today with progress, streaks and 30 days of history', async () => {
    mockApi({
      'GET /habits': () => ({
        body: {
          data: [
            makeHabit({
              id: WATER,
              name: 'Drink water',
              completions: [addDays(today(), -1), today()],
              stats: {
                ...makeHabit({ id: WATER, name: '' }).stats,
                completedToday: true,
                currentStreak: 2,
                totalCompletions: 2,
              },
            }),
            makeHabit({ id: READ, name: 'Read 20 pages' }),
            makeHabit({
              id: '00000000-0000-4000-8000-00000000a003',
              name: 'Gym',
              stats: { ...makeHabit({ id: '', name: '' }).stats, scheduledToday: false },
            }),
          ],
        },
      }),
    });
    renderApp('/');

    const list = await screen.findByRole('list', { name: "Today's daily tasks" });
    expect(within(list).getAllByRole('checkbox')).toHaveLength(2); // Gym isn't due today
    expect(screen.getByText(/done today/).textContent).toMatch(/1 of 2/);
    expect(within(list).getByText('2 times done')).toBeInTheDocument();

    const dots = screen.getByRole('list', { name: 'Last 30 days for Drink water' });
    expect(within(dots).getAllByRole('listitem')).toHaveLength(30);
    expect(within(dots).getAllByText(/: done$/)).toHaveLength(2);
  });

  it('ticks a daily task for today only after the server confirms', async () => {
    let resolve!: () => void;
    const gate = new Promise<void>((r) => (resolve = r));
    let completed = false;
    const habit = () =>
      makeHabit({
        id: READ,
        name: 'Read 20 pages',
        completions: completed ? [today()] : [],
        stats: { ...makeHabit({ id: '', name: '' }).stats, completedToday: completed },
      });
    const calls = mockApi({
      'GET /habits': () => ({ body: { data: [habit()] } }),
      [`PUT /habits/${READ}/completions/${today()}`]: async () => {
        await gate;
        completed = true;
        return { body: { data: habit() } };
      },
    });
    renderApp('/');

    const box = await screen.findByRole('checkbox', { name: 'Mark "Read 20 pages" as done today' });
    await userEvent.click(box);
    expect(box).not.toBeChecked();
    expect(box).toBeDisabled();

    resolve();
    await waitFor(() =>
      expect(
        screen.getByRole('checkbox', { name: 'Mark "Read 20 pages" as not done today' }),
      ).toBeChecked(),
    );
    expect(
      calls.some((c) => c.method === 'PUT' && c.path.endsWith(`/completions/${today()}`)),
    ).toBe(true);
  });

  it('offers to add a daily task when there are none, opening the form set to repeat', async () => {
    mockApi();
    renderApp('/');
    await userEvent.click(await screen.findByRole('button', { name: 'Add a daily task' }));
    const dialog = await screen.findByRole('dialog', { name: 'New task' });
    expect(within(dialog).getByRole('button', { name: 'Every day' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(dialog).getByRole('button', { name: 'Add daily task' })).toBeInTheDocument();
  });
});

describe('task form: repeats and reminders', () => {
  it('saves a repeating task as a daily task', async () => {
    const calls = mockApi({
      'POST /habits': ({ body }) => ({
        status: 201,
        body: { data: makeHabit({ id: WATER, name: (body as { name: string }).name }) },
      }),
    });
    renderApp('/tasks');
    await userEvent.click((await screen.findAllByRole('button', { name: 'New task' }))[0]);
    const dialog = await screen.findByRole('dialog', { name: 'New task' });

    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Title' }), 'Meditate');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Specific days' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add daily task' }));
    expect(await within(dialog).findByText('Pick at least one day')).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Mon' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Wed' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add daily task' }));

    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    expect(calls.find((c) => c.method === 'POST')).toMatchObject({
      path: '/habits',
      body: { name: 'Meditate', frequency: 'SPECIFIC_DAYS', daysOfWeek: [1, 3] },
    });
    expect(calls.some((c) => c.path === '/tasks' && c.method === 'POST')).toBe(false);
  });

  it('creates the task, then saves the chosen reminders', async () => {
    const created = makeTask({ title: 'Exam', dueDate: addDays(today(), 10) });
    const calls = mockApi({
      'POST /tasks': () => ({ status: 201, body: { data: created } }),
      [`PUT /tasks/${created.id}/reminders`]: () => ({ body: { data: [] } }),
    });
    renderApp('/tasks');
    await userEvent.click((await screen.findAllByRole('button', { name: 'New task' }))[0]);
    const dialog = await screen.findByRole('dialog', { name: 'New task' });

    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Title' }), 'Exam');
    // Presets need a due date first.
    expect(within(dialog).getByRole('button', { name: '1 week before' })).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText(/Due date/), addDays(today(), 10));
    await userEvent.click(within(dialog).getByRole('button', { name: '1 week before' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'On the day' }));
    expect(within(dialog).getByRole('list', { name: 'Chosen reminders' })).toHaveTextContent(
      '1 week before at 08:00',
    );

    await userEvent.click(within(dialog).getByRole('button', { name: 'Create task' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true));
    const put = calls.find((c) => c.method === 'PUT');
    expect(put?.body).toEqual({
      reminders: [
        { type: 'relative', daysBefore: 7, time: '08:00' },
        { type: 'relative', daysBefore: 0, time: '08:00' },
      ],
    });
    expect(calls.findIndex((c) => c.method === 'POST')).toBeLessThan(
      calls.findIndex((c) => c.method === 'PUT'),
    );
  });
});

describe('settings: notifications', () => {
  it('saves a WhatsApp number and sends a test message', async () => {
    const calls = mockApi({
      'GET /settings/notifications': () => ({
        body: { data: { email: 'live', whatsapp: 'live' } },
      }),
      'PATCH /settings': ({ body }) => ({
        body: { data: { ...session.settings, ...(body as object) } },
      }),
      'POST /settings/notifications/test': () => ({
        body: { data: { to: '+919876543210', mode: 'live' } },
      }),
    });
    renderApp('/settings');

    const phone = await screen.findByRole('textbox', { name: /WhatsApp number/ });
    await userEvent.click(screen.getByRole('switch', { name: /WhatsApp reminders/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Save notifications' }));
    expect(
      await screen.findByText('Add your WhatsApp number to turn on WhatsApp reminders'),
    ).toBeInTheDocument();

    await userEvent.type(phone, '+91 98765 43210');
    await userEvent.click(screen.getByRole('button', { name: 'Save notifications' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'PATCH')).toBe(true));
    expect(calls.find((c) => c.method === 'PATCH')?.body).toMatchObject({
      notifyPhone: '+919876543210',
      whatsappReminders: true,
    });

    await userEvent.click(await screen.findByRole('button', { name: 'Send test WhatsApp' }));
    expect(
      await screen.findByText('Test WhatsApp message sent to +919876543210'),
    ).toBeInTheDocument();
  });

  it('explains preview mode and lists recent deliveries with their message', async () => {
    mockApi({
      'GET /settings/notifications': () => ({
        body: { data: { email: 'preview', whatsapp: 'live' } },
      }),
      'GET /settings/notifications/log': () => ({
        body: {
          data: [
            {
              id: 'd1',
              channel: 'EMAIL',
              destination: 'ada@example.com',
              subject: 'Reminder: Exam',
              body: 'Exam is due tomorrow.',
              mode: 'PREVIEW',
              ok: true,
              error: null,
              fromReminder: true,
              createdAt: '2026-10-19T08:00:00.000Z',
            },
            {
              id: 'd2',
              channel: 'WHATSAPP',
              destination: '+919876543210',
              subject: 'Routinely test notification',
              body: 'Reminders will arrive like this.',
              mode: 'LIVE',
              ok: false,
              error: 'Twilio rejected the message',
              fromReminder: false,
              createdAt: '2026-10-19T07:00:00.000Z',
            },
          ],
        },
      }),
    });
    renderApp('/settings');

    expect(await screen.findByText(/Preview mode for Email/)).toBeInTheDocument();
    const log = await screen.findByRole('region', { name: 'Recent deliveries' });
    const [reminder, test] = within(log).getAllByRole('listitem');
    expect(within(reminder).getByText('Preview')).toBeInTheDocument();
    expect(within(test).getByText('Failed')).toBeInTheDocument();

    await userEvent.click(within(reminder).getByText('Reminder: Exam'));
    expect(within(reminder).getByText('Exam is due tomorrow.')).toBeVisible();
    expect(within(reminder).getByText(/To ada@example.com · Task reminder/)).toBeInTheDocument();
    expect(within(test).getByText('Twilio rejected the message')).toBeInTheDocument();
  });

  it('runs the system check on request and shows how to fix each problem', async () => {
    const calls = mockApi({
      'GET /system/checks': () => ({
        body: {
          data: [
            {
              key: 'database',
              label: 'Database',
              status: 'ok',
              detail: 'PostgreSQL is connected',
              fix: null,
            },
            {
              key: 'email',
              label: 'Email (Gmail SMTP)',
              status: 'missing',
              detail: 'Not set up yet',
              fix: 'Set SMTP_PASS in backend/.env',
            },
          ],
        },
      }),
    });
    renderApp('/settings');

    const run = await screen.findByRole('button', { name: 'Run checks' });
    expect(calls.some((c) => c.path === '/system/checks')).toBe(false);
    await userEvent.click(run);

    expect(await screen.findByText('PostgreSQL is connected')).toBeInTheDocument();
    expect(screen.getByText('Working')).toBeInTheDocument();
    expect(screen.getByText('Not set up')).toBeInTheDocument();
    expect(screen.getByText('Set SMTP_PASS in backend/.env')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run again' })).toBeInTheDocument();
  });
});
