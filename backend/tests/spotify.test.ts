import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/db.js';
import { decryptSecret } from '../src/lib/secrets.js';
import { CSRF, app, signUp, useCleanDatabase, type Agent } from './helpers.js';

useCleanDatabase();
afterEach(() => vi.restoreAllMocks());

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const track = (id: string, artist: string, minutes: number) => ({
  id,
  name: `Song ${id}`,
  duration_ms: minutes * 60_000,
  artists: [{ name: artist }],
  album: {
    name: 'Album',
    images: [{ url: 'https://i.scdn.co/image/big' }, { url: 'https://i.scdn.co/image/small' }],
  },
  external_urls: { spotify: `https://open.spotify.com/track/${id}` },
});

/** Stands in for Spotify's accounts and Web API; records every request made to it. */
function fakeSpotify(overrides: Partial<Record<string, () => Response>> = {}) {
  const calls: { url: string; body: string }[] = [];
  const now = Date.now();
  const routes: Record<string, () => Response> = {
    '/api/token': () =>
      json({
        access_token: 'access-1',
        refresh_token: 'refresh-1',
        expires_in: 3600,
        scope: 'user-top-read',
      }),
    '/v1/me': () => json({ id: 'spotify-user', display_name: 'Ada on Spotify' }),
    '/v1/me/player/currently-playing': () =>
      json({
        is_playing: true,
        currently_playing_type: 'track',
        item: track('now', 'Arijit Singh', 4),
      }),
    '/v1/me/player/recently-played': () =>
      json({
        items: [
          {
            track: track('a', 'Arijit Singh', 4),
            played_at: new Date(now - 30 * 60_000).toISOString(),
          },
          {
            track: track('b', 'Arijit Singh', 5),
            played_at: new Date(now - 20 * 60_000).toISOString(),
          },
          {
            track: track('c', 'A. R. Rahman', 3),
            played_at: new Date(now - 10 * 60_000).toISOString(),
          },
        ],
      }),
    '/v1/me/top/artists': () =>
      json({
        items: [
          { id: 'ar1', name: 'Arijit Singh', images: [], external_urls: { spotify: 'https://x' } },
        ],
      }),
    '/v1/me/top/tracks': () => json({ items: [track('t1', 'Arijit Singh', 4)] }),
    ...overrides,
  };
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    calls.push({ url: url.toString(), body: init?.body ? String(init.body) : '' });
    const handler = routes[url.pathname];
    return handler ? handler() : json({ error: 'not stubbed' }, 404);
  });
  return calls;
}

/** Runs the whole connect flow and returns the agent of a connected user. */
async function connect(): Promise<Agent> {
  const { agent } = await signUp({ timezone: 'UTC' });
  const res = await agent.post('/api/spotify/connect').set(CSRF).expect(200);
  const state = new URL(res.body.data.url).searchParams.get('state');
  await request(app).get(`/api/spotify/callback?code=auth-code&state=${state}`).expect(302);
  return agent;
}

describe('Spotify connection', () => {
  it('builds a read-only Spotify sign-in link', async () => {
    const { agent } = await signUp();
    const status = await agent.get('/api/spotify/status').expect(200);
    expect(status.body.data).toEqual({ configured: true, connected: false, displayName: null });

    const res = await agent.post('/api/spotify/connect').set(CSRF).expect(200);
    const url = new URL(res.body.data.url);
    expect(url.origin).toBe('https://accounts.spotify.com');
    expect(url.searchParams.get('client_id')).toBe('test-spotify-client');
    expect(url.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:4000/api/spotify/callback');
    expect(url.searchParams.get('scope')).toBe(
      'user-read-recently-played user-top-read user-read-currently-playing',
    );
    expect(url.searchParams.get('state')).toBeTruthy();
  });

  it('links the account on callback and stores the tokens encrypted', async () => {
    const calls = fakeSpotify();
    const { agent, user } = await signUp();
    const res = await agent.post('/api/spotify/connect').set(CSRF).expect(200);
    const state = new URL(res.body.data.url).searchParams.get('state');

    const back = await request(app)
      .get(`/api/spotify/callback?code=auth-code&state=${state}`)
      .expect(302);
    expect(back.headers.location).toBe('http://localhost:5173/?spotify=connected');
    expect(calls[0].body).toContain('grant_type=authorization_code');

    const row = await prisma.spotifyConnection.findUniqueOrThrow({ where: { userId: user.id } });
    expect(row.accessToken).not.toContain('access-1');
    expect(decryptSecret(row.accessToken)).toBe('access-1');
    expect(decryptSecret(row.refreshToken)).toBe('refresh-1');

    const status = await agent.get('/api/spotify/status').expect(200);
    expect(status.body.data).toMatchObject({ connected: true, displayName: 'Ada on Spotify' });
  });

  it('says why a connection failed, without linking anything', async () => {
    const callbackFor = async (overrides: Parameters<typeof fakeSpotify>[0]) => {
      vi.restoreAllMocks();
      vi.spyOn(console, 'error').mockImplementation(() => {});
      fakeSpotify(overrides);
      const { agent } = await signUp();
      const res = await agent.post('/api/spotify/connect').set(CSRF).expect(200);
      const state = new URL(res.body.data.url).searchParams.get('state');
      return (await request(app).get(`/api/spotify/callback?code=c&state=${state}`).expect(302))
        .headers.location;
    };

    // Signed in, but the account isn't allowed to use a Development-mode app.
    const notAllowed = await callbackFor({
      '/v1/me': () => json({ error: { status: 403, message: 'User not registered' } }, 403),
    });
    expect(notAllowed).toMatch(/spotify=error&reason=not_allowed$/);
    // Code exchange refused, e.g. a redirect URI mismatch.
    const rejected = await callbackFor({
      '/api/token': () =>
        json({ error: 'invalid_grant', error_description: 'Invalid redirect URI' }, 400),
    });
    expect(rejected).toMatch(/spotify=error&reason=rejected$/);
    expect(await prisma.spotifyConnection.count()).toBe(0);
  });

  it('refuses tampered or missing state, and reports a declined sign-in', async () => {
    fakeSpotify();
    const bad = await request(app).get('/api/spotify/callback?code=x&state=forged').expect(302);
    expect(bad.headers.location).toMatch(/spotify=error&reason=expired$/);
    const denied = await request(app).get('/api/spotify/callback?error=access_denied').expect(302);
    expect(denied.headers.location).toMatch(/spotify=denied$/);
    expect(await prisma.spotifyConnection.count()).toBe(0);
  });
});

describe('Spotify listening summary', () => {
  it("summarises today's listening, now playing and top picks", async () => {
    fakeSpotify();
    const agent = await connect();
    const res = await agent.get('/api/spotify/summary').expect(200);
    expect(res.body.data.today).toEqual({ minutes: 12, plays: 3, topArtist: 'Arijit Singh' });
    expect(res.body.data.nowPlaying).toMatchObject({ name: 'Song now', isPlaying: true });
    expect(res.body.data.recent).toHaveLength(3);
    expect(res.body.data.topArtists[0].name).toBe('Arijit Singh');
    expect(res.body.data.topTracks[0].imageUrl).toBe('https://i.scdn.co/image/big');
  });

  it('refreshes an expired access token and saves the new one', async () => {
    const calls = fakeSpotify();
    const agent = await connect();
    await prisma.spotifyConnection.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });

    await agent.get('/api/spotify/summary').expect(200);
    expect(calls.some((c) => c.body.includes('grant_type=refresh_token'))).toBe(true);
    const row = await prisma.spotifyConnection.findFirstOrThrow();
    expect(row.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('forgets the connection when Spotify access has been revoked', async () => {
    fakeSpotify();
    const agent = await connect();
    fakeSpotify({ '/v1/me/player/recently-played': () => json({ error: 'revoked' }, 401) });

    const res = await agent.get('/api/spotify/summary');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SPOTIFY_DISCONNECTED');
    expect(await prisma.spotifyConnection.count()).toBe(0);
  });

  it('disconnects, and requires a session for everything but the callback', async () => {
    fakeSpotify();
    const agent = await connect();
    await agent.delete('/api/spotify').set(CSRF).expect(204);
    expect(await prisma.spotifyConnection.count()).toBe(0);
    await request(app).get('/api/spotify/summary').expect(401);
    await request(app).post('/api/spotify/connect').set(CSRF).expect(401);
  });
});
