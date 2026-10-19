import type { SpotifySummary } from '@planner/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { mockApi, renderApp } from './utils';

const summary: SpotifySummary = {
  nowPlaying: {
    id: 'now',
    name: 'Tum Hi Ho',
    artists: ['Arijit Singh'],
    album: 'Aashiqui 2',
    imageUrl: null,
    url: 'https://open.spotify.com/track/now',
    durationMs: 260_000,
    isPlaying: true,
  },
  today: { minutes: 42, plays: 12, topArtist: 'Arijit Singh' },
  recent: [
    {
      id: 'r1',
      name: 'Kesariya',
      artists: ['Arijit Singh'],
      album: 'Brahmastra',
      imageUrl: null,
      url: 'https://open.spotify.com/track/r1',
      durationMs: 240_000,
      playedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    },
  ],
  topArtists: [
    { id: 'a1', name: 'A. R. Rahman', imageUrl: null, url: 'https://open.spotify.com/artist/a1' },
  ],
  topTracks: [],
};

describe('dashboard: Spotify', () => {
  it('offers to connect, and sends the browser to Spotify sign-in', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    mockApi({
      'GET /spotify/status': () => ({
        body: { data: { configured: true, connected: false, displayName: null } },
      }),
      'POST /spotify/connect': () => ({
        body: { data: { url: 'https://accounts.spotify.com/authorize?state=x' } },
      }),
    });
    renderApp('/');

    await userEvent.click(await screen.findByRole('button', { name: 'Connect Spotify' }));
    expect(assign).toHaveBeenCalledWith('https://accounts.spotify.com/authorize?state=x');
    vi.unstubAllGlobals();
  });

  it("shows today's listening, now playing, top artists and recent plays", async () => {
    mockApi({
      'GET /spotify/status': () => ({
        body: { data: { configured: true, connected: true, displayName: 'Ada' } },
      }),
      'GET /spotify/summary': () => ({ body: { data: summary } }),
    });
    renderApp('/');

    const headline = await screen.findByText(/of music today/);
    expect(headline).toHaveTextContent(
      "You've listened to 42 min of music today across 12 songs, mostly Arijit Singh.",
    );
    expect(screen.getByText('Now playing')).toBeInTheDocument();
    expect(screen.getByText('Tum Hi Ho')).toBeInTheDocument();
    const artists = screen.getByRole('region', { name: 'Top artists this month' });
    expect(within(artists).getByText('A. R. Rahman')).toBeInTheDocument();
    const recent = screen.getByRole('region', { name: 'Recently played' });
    expect(within(recent).getByText('5 min ago')).toBeInTheDocument();
    expect(screen.getByText('Connected as Ada')).toBeInTheDocument();
  });

  it('explains the server setup when Spotify is not configured', async () => {
    mockApi({
      'GET /spotify/status': () => ({
        body: { data: { configured: false, connected: false, displayName: null } },
      }),
    });
    renderApp('/');
    expect(await screen.findByText(/SPOTIFY_CLIENT_ID/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Connect Spotify' })).not.toBeInTheDocument();
  });

  it('confirms the connection after returning from Spotify', async () => {
    mockApi({
      'GET /spotify/status': () => ({
        body: { data: { configured: true, connected: true, displayName: 'Ada' } },
      }),
      'GET /spotify/summary': () => ({ body: { data: summary } }),
    });
    renderApp('/?spotify=connected');
    expect(await screen.findByText('Spotify connected')).toBeInTheDocument();
  });

  it('explains what to fix when Spotify refuses the connection', async () => {
    mockApi({
      'GET /spotify/status': () => ({
        body: { data: { configured: true, connected: false, displayName: null } },
      }),
    });
    renderApp('/?spotify=error&reason=not_allowed');
    expect(
      await screen.findByText(/add your Spotify account's email under User Management/),
    ).toBeInTheDocument();
  });
});
