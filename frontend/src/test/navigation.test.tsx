import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { makeTask, mockApi, renderApp, today } from './utils';

describe('navigation and layout', () => {
  it('redirects signed-out users to the login page', async () => {
    mockApi({}, { signedIn: false });
    renderApp('/today');
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
  });

  it('shows every page in the header navigation and navigates between them', async () => {
    mockApi();
    renderApp('/');
    const nav = await screen.findByRole('navigation', { name: 'Main navigation' });
    expect(nav.closest('header')).not.toBeNull();
    for (const label of [
      'Dashboard',
      'My Tasks',
      'Today',
      'Upcoming',
      'Calendar',
      'Completed',
      'Habits',
      'Categories',
      'Settings',
    ]) {
      expect(within(nav).getByRole('link', { name: label })).toBeInTheDocument();
    }

    await userEvent.click(within(nav).getByRole('link', { name: 'Today' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Today' })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: 'Today' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    await userEvent.click(within(nav).getByRole('link', { name: 'Habits' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Habits' })).toBeInTheDocument();
  });

  it('has no sidebar any more', async () => {
    mockApi();
    renderApp('/');
    await screen.findByRole('navigation', { name: 'Main navigation' });
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('keeps the header to the brand, the day/night toggle and the account menu', async () => {
    mockApi();
    renderApp('/');
    const header = (await screen.findByRole('navigation', { name: 'Main navigation' })).closest(
      'header',
    )!;
    expect(within(header).queryByRole('searchbox')).not.toBeInTheDocument();
    expect(within(header).queryByRole('button', { name: 'New task' })).not.toBeInTheDocument();
    expect(within(header).getByRole('button', { name: /Switch to/ })).toBeInTheDocument();
    expect(within(header).getByRole('button', { name: /Account menu/ })).toBeInTheDocument();
  });

  it('shows a gauge, a donut and a pie that summarise the tasks', async () => {
    const work = { id: 'c1', name: 'Work', color: '#4f46e5' };
    mockApi(
      {},
      {
        tasks: [
          makeTask({ title: 'Plan the week', dueDate: today(), status: 'COMPLETED' }),
          makeTask({ dueDate: today(), status: 'IN_PROGRESS', categoryId: 'c1', category: work }),
          makeTask({ categoryId: 'c1', category: work }),
          makeTask({ dueDate: '2020-01-01' }),
        ],
      },
    );
    renderApp('/');

    // Gauge: 1 of the 2 tasks due today is done.
    const gauge = await screen.findByRole('meter', { name: "Today's progress" });
    expect(gauge).toHaveAttribute('aria-valuenow', '50');
    expect(within(gauge).getByText('1 of 2 done')).toBeInTheDocument();

    // Donut: every open task counted once — 1 to do, 1 in progress, 1 overdue.
    const status = screen.getByRole('table', { name: 'Open tasks by status' });
    expect(within(status).getByRole('row', { name: /To do/ })).toHaveTextContent('1 (33%)');
    expect(within(status).getByRole('row', { name: /Overdue/ })).toHaveTextContent('1 (33%)');

    // Pie: 2 open tasks in Work, 1 without a category.
    const categories = screen.getByRole('table', { name: 'Open tasks by category' });
    expect(within(categories).getByRole('row', { name: /Work/ })).toHaveTextContent('2 (67%)');
    expect(within(categories).getByRole('row', { name: /No category/ })).toHaveTextContent(
      '1 (33%)',
    );
  });

  it('shows a focused dashboard with one switchable progress chart', async () => {
    mockApi({}, { tasks: [makeTask({ title: 'Plan the week', dueDate: today() })] });
    renderApp('/');

    expect(await screen.findByText('Plan the week')).toBeInTheDocument();
    expect(screen.queryByText('Open tasks by priority')).not.toBeInTheDocument();
    expect(screen.queryByText('Insights')).not.toBeInTheDocument();

    const range = screen.getByRole('group', { name: 'Progress range' });
    expect(within(range).getByRole('button', { name: 'This week' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText('Tasks planned and done each day this week')).toBeInTheDocument();

    await userEvent.click(within(range).getByRole('button', { name: '8 weeks' }));
    expect(screen.getByText('Tasks completed per week, last 8 weeks')).toBeInTheDocument();
  });

  it('shows the new-user empty state on the dashboard', async () => {
    mockApi();
    renderApp('/');
    expect(await screen.findByText('Welcome to Routinely')).toBeInTheDocument();
    expect(screen.getByText(/Ada/, { selector: 'h1' })).toBeInTheDocument();
  });
});
