import type { SpotifyArtist, SpotifyPlay, SpotifyTrack } from '@planner/shared';
import { config } from '../config.js';

/** Read-only access to listening data; the app never controls playback or edits anything. */
export const SPOTIFY_SCOPES = [
  'user-read-recently-played',
  'user-top-read',
  'user-read-currently-playing',
].join(' ');

const ACCOUNTS = 'https://accounts.spotify.com';
const API = 'https://api.spotify.com/v1';

export class SpotifyError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export interface SpotifyTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
  scope: string;
}

export function isSpotifyConfigured() {
  return Boolean(config.SPOTIFY_CLIENT_ID && config.SPOTIFY_CLIENT_SECRET);
}

export function authorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: config.SPOTIFY_CLIENT_ID ?? '',
    response_type: 'code',
    redirect_uri: config.SPOTIFY_REDIRECT_URI,
    scope: SPOTIFY_SCOPES,
    state,
  });
  return `${ACCOUNTS}/authorize?${params}`;
}

async function tokenRequest(body: Record<string, string>): Promise<SpotifyTokens> {
  const basic = Buffer.from(`${config.SPOTIFY_CLIENT_ID}:${config.SPOTIFY_CLIENT_SECRET}`).toString(
    'base64',
  );
  const res = await fetch(`${ACCOUNTS}/api/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(body),
  });
  const json = (await res.json().catch(() => null)) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    error_description?: string;
  } | null;
  if (!res.ok || !json?.access_token) {
    throw new SpotifyError(json?.error_description ?? 'Spotify rejected the sign-in', res.status);
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    // Refresh a minute early so a token never expires mid-request.
    expiresAt: new Date(Date.now() + ((json.expires_in ?? 3600) - 60) * 1000),
    scope: json.scope ?? SPOTIFY_SCOPES,
  };
}

export const exchangeCode = (code: string) =>
  tokenRequest({
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.SPOTIFY_REDIRECT_URI,
  });

export const refreshTokens = (refreshToken: string) =>
  tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken });

async function get<T>(token: string, path: string): Promise<T | null> {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 204) return null; // e.g. nothing playing right now
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    const detail = body?.error?.message ? `: ${body.error.message}` : '';
    throw new SpotifyError(`Spotify request failed (${res.status})${detail}`, res.status);
  }
  return (await res.json()) as T;
}

/* --------------------- Spotify Web API shapes (subset) --------------------- */

interface ApiImage {
  url: string;
}
interface ApiTrack {
  id: string;
  name: string;
  duration_ms: number;
  artists: { name: string }[];
  album: { name: string; images: ApiImage[] };
  external_urls: { spotify: string };
}
interface ApiArtist {
  id: string;
  name: string;
  images: ApiImage[];
  external_urls: { spotify: string };
}

/** Smallest image that's still at least 64px, falling back to any. */
const pickImage = (images: ApiImage[]) => images.at(-2)?.url ?? images[0]?.url ?? null;

const toTrack = (t: ApiTrack): SpotifyTrack => ({
  id: t.id,
  name: t.name,
  artists: t.artists.map((a) => a.name),
  album: t.album.name,
  imageUrl: pickImage(t.album.images),
  url: t.external_urls.spotify,
  durationMs: t.duration_ms,
});

export async function getProfile(token: string) {
  const me = await get<{ id: string; display_name: string | null }>(token, '/me');
  return { id: me?.id ?? '', displayName: me?.display_name ?? null };
}

export async function getRecentlyPlayed(token: string): Promise<SpotifyPlay[]> {
  const json = await get<{ items: { track: ApiTrack; played_at: string }[] }>(
    token,
    '/me/player/recently-played?limit=50',
  );
  return (json?.items ?? []).map((i) => ({ ...toTrack(i.track), playedAt: i.played_at }));
}

export async function getTopArtists(token: string): Promise<SpotifyArtist[]> {
  const json = await get<{ items: ApiArtist[] }>(
    token,
    '/me/top/artists?time_range=short_term&limit=5',
  );
  return (json?.items ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    imageUrl: pickImage(a.images),
    url: a.external_urls.spotify,
  }));
}

export async function getTopTracks(token: string): Promise<SpotifyTrack[]> {
  const json = await get<{ items: ApiTrack[] }>(
    token,
    '/me/top/tracks?time_range=short_term&limit=5',
  );
  return (json?.items ?? []).map(toTrack);
}

export async function getCurrentlyPlaying(token: string) {
  const json = await get<{
    is_playing: boolean;
    item: ApiTrack | null;
    currently_playing_type: string;
  }>(token, '/me/player/currently-playing');
  if (!json?.item || json.currently_playing_type !== 'track') return null;
  return { ...toTrack(json.item), isPlaying: json.is_playing };
}
