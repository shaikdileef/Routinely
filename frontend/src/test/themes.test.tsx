import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { mockApi, renderApp, session } from './utils';

afterEach(() => {
  delete document.documentElement.dataset.palette;
});

describe('colour themes', () => {
  it('lists every theme with the current one selected', async () => {
    mockApi();
    renderApp('/settings');
    const group = await screen.findByRole('radiogroup', { name: 'Colour theme' });
    const options = Array.from(group.querySelectorAll('[role="radio"]'));
    expect(options).toHaveLength(6);
    expect(screen.getByRole('radio', { name: /^Lavender Glass/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(document.documentElement.dataset.palette).toBe('lavender');
  });

  it('saves and applies a theme when its card is chosen', async () => {
    const calls = mockApi({
      'PATCH /settings': ({ body }) => ({
        body: { data: { ...session.settings, ...(body as object) } },
      }),
    });
    renderApp('/settings');

    await userEvent.click(await screen.findByRole('radio', { name: /^Aurora/ }));

    await waitFor(() => expect(document.documentElement.dataset.palette).toBe('aurora'));
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ colorTheme: 'AURORA' });
    expect(screen.getByRole('radio', { name: /^Aurora/ })).toHaveAttribute('aria-checked', 'true');
    expect(await screen.findByText('Aurora theme applied')).toBeInTheDocument();
  });

  it('keeps the current theme when saving fails', async () => {
    mockApi({
      'PATCH /settings': () => ({
        status: 500,
        body: { error: { code: 'INTERNAL_ERROR', message: 'Database unavailable' } },
      }),
    });
    renderApp('/settings');
    await userEvent.click(await screen.findByRole('radio', { name: /^Sunset Glow/ }));
    expect(await screen.findByText('Database unavailable')).toBeInTheDocument();
    expect(document.documentElement.dataset.palette).toBe('lavender');
  });
});
