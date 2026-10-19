import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { mockApi, renderApp, session } from './utils';

const PHOTO_URL = '/api/auth/images/avatar?v=1';
const accountButton = () => screen.getByRole('button', { name: /Account menu/ });

describe('profile photo', () => {
  it('shows initials until a photo is uploaded, then shows the photo in the top bar', async () => {
    const calls = mockApi({
      'PUT /auth/images/avatar': () => ({
        body: { data: { ...session.user, avatarUrl: PHOTO_URL } },
      }),
      'DELETE /auth/images/avatar': () => ({
        body: { data: { ...session.user, avatarUrl: null } },
      }),
    });
    renderApp('/settings');

    await screen.findByRole('button', { name: 'Upload photo' });
    expect(within(accountButton()).getByText('AL')).toBeInTheDocument();

    const photo = new File(['png'], 'me.png', { type: 'image/png' });
    await userEvent.upload(screen.getByLabelText('Choose a profile photo'), photo);

    await waitFor(() =>
      expect(accountButton().querySelector('img')?.getAttribute('src')).toBe(PHOTO_URL),
    );
    const upload = calls.find((c) => c.method === 'PUT');
    expect(upload?.path).toBe('/auth/images/avatar');
    expect(upload?.body).toBe(photo);

    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(accountButton().querySelector('img')).toBeNull());
    expect(within(accountButton()).getByText('AL')).toBeInTheDocument();
  });

  it('rejects unsupported files without uploading', async () => {
    const calls = mockApi();
    renderApp('/settings');
    const input = await screen.findByLabelText('Choose a profile photo');
    const pdf = new File(['%PDF'], 'cv.pdf', { type: 'application/pdf' });
    await userEvent.upload(input, pdf, { applyAccept: false });
    expect(await screen.findByText('Use a PNG, JPEG, WebP or GIF image')).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'PUT')).toBe(false);
  });
});
