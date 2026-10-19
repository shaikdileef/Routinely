import {
  summarizeListeningDay,
  todayInTimeZone,
  type SpotifyStatus,
  type SpotifySummary,
} from '@planner/shared';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { AppError } from '../lib/errors.js';
import type { AuthContext } from '../lib/http.js';
import { decryptSecret, encryptSecret } from '../lib/secrets.js';
import {
  authorizeUrl,
  exchangeCode,
  getCurrentlyPlaying,
  getProfile,
  getRecentlyPlayed,
  getTopArtists,
  getTopTracks,
  isSpotifyConfigured,
  refreshTokens,
  SpotifyError,
} from '../spotify/client.js';

const STATE_PURPOSE = 'spotify-connect';

const notConfigured = () =>
  new AppError(
    400,
    'NOT_CONFIGURED',
    'Spotify is not set up on the server (see SPOTIFY_* in backend/.env)',
  );

export async function getSpotifyStatus(userId: string): Promise<SpotifyStatus> {
  const connection = await prisma.spotifyConnection.findUnique({ where: { userId } });
  return {
    configured: isSpotifyConfigured(),
    connected: Boolean(connection),
    displayName: connection?.displayName ?? null,
  };
}

/**
 * The Spotify sign-in URL. Its `state` is a short-lived signed token naming the user, so the
 * callback can link the account without relying on the session cookie (Spotify redirects to
 * 127.0.0.1, a different origin from localhost).
 */
export function spotifyConnectUrl(userId: string): string {
  if (!isSpotifyConfigured()) throw notConfigured();
  const state = jwt.sign({ sub: userId, purpose: STATE_PURPOSE }, config.JWT_SECRET, {
    expiresIn: '10m',
    algorithm: 'HS256',
  });
  return authorizeUrl(state);
}

/**
 * Why a connection failed, as a fixed code the app turns into a helpful message (a code rather
 * than Spotify's text, so nothing arbitrary is echoed through the URL).
 */
export type SpotifyConnectFailure =
  | 'not_configured'
  | 'expired'
  | 'rejected'
  | 'not_allowed'
  | 'unknown';

export type SpotifyConnectResult =
  | { result: 'connected' | 'denied' }
  | { result: 'error'; reason: SpotifyConnectFailure };

const failed = (reason: SpotifyConnectFailure, detail?: string): SpotifyConnectResult => {
  console.error(`Spotify connection failed (${reason})${detail ? `: ${detail}` : ''}`);
  return { result: 'error', reason };
};

/** Handles Spotify's redirect back; returns what to show in the app. */
export async function completeSpotifyConnection(
  code: string | undefined,
  state: string | undefined,
  error: string | undefined,
): Promise<SpotifyConnectResult> {
  if (error === 'access_denied') return { result: 'denied' };
  if (error) return failed('rejected', error);
  if (!isSpotifyConfigured()) return failed('not_configured');
  if (!code || !state) return failed('unknown', 'missing code or state');

  let userId: string;
  try {
    const payload = jwt.verify(state, config.JWT_SECRET, { algorithms: ['HS256'] });
    if (typeof payload !== 'object' || payload.purpose !== STATE_PURPOSE || !payload.sub) {
      return failed('expired', 'state is not a Spotify connect token');
    }
    userId = payload.sub;
  } catch (err) {
    return failed('expired', err instanceof Error ? err.message : undefined);
  }
  if (!(await prisma.user.findUnique({ where: { id: userId }, select: { id: true } }))) {
    return failed('expired', 'user no longer exists');
  }

  let tokens: Awaited<ReturnType<typeof exchangeCode>>;
  try {
    tokens = await exchangeCode(code);
  } catch (err) {
    return failed('rejected', err instanceof Error ? err.message : undefined);
  }

  try {
    const profile = await getProfile(tokens.accessToken);
    const data = {
      spotifyUserId: profile.id,
      displayName: profile.displayName,
      accessToken: encryptSecret(tokens.accessToken),
      refreshToken: encryptSecret(tokens.refreshToken ?? ''),
      expiresAt: tokens.expiresAt,
      scope: tokens.scope,
    };
    await prisma.spotifyConnection.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
    return { result: 'connected' };
  } catch (err) {
    const message = err instanceof Error ? err.message : undefined;
    // 403 here means Spotify signed you in but won't let this app read your account: in
    // Development mode that's a user missing from User Management (or, under Spotify's newer
    // rules, an app owner without Premium).
    if (err instanceof SpotifyError && err.status === 403) return failed('not_allowed', message);
    return failed('unknown', message);
  }
}

/** A valid access token for the user, refreshing (and saving) it when it has expired. */
async function accessTokenFor(userId: string): Promise<string> {
  const connection = await prisma.spotifyConnection.findUnique({ where: { userId } });
  if (!connection) throw new AppError(404, 'NOT_CONNECTED', 'Spotify is not connected');
  if (connection.expiresAt > new Date()) return decryptSecret(connection.accessToken);

  const refreshed = await refreshTokens(decryptSecret(connection.refreshToken));
  await prisma.spotifyConnection.update({
    where: { userId },
    data: {
      accessToken: encryptSecret(refreshed.accessToken),
      // Spotify may or may not rotate the refresh token.
      ...(refreshed.refreshToken ? { refreshToken: encryptSecret(refreshed.refreshToken) } : {}),
      expiresAt: refreshed.expiresAt,
    },
  });
  return refreshed.accessToken;
}

/** Listening summary for the dashboard: now playing, today, recent plays and top picks. */
export async function getSpotifySummary(auth: AuthContext): Promise<SpotifySummary> {
  if (!isSpotifyConfigured()) throw notConfigured();
  try {
    const token = await accessTokenFor(auth.userId);
    const [nowPlaying, recent, topArtists, topTracks] = await Promise.all([
      getCurrentlyPlaying(token),
      getRecentlyPlayed(token),
      getTopArtists(token),
      getTopTracks(token),
    ]);
    return {
      nowPlaying,
      today: summarizeListeningDay(recent, auth.timezone, todayInTimeZone(auth.timezone)),
      recent: recent.slice(0, 5),
      topArtists,
      topTracks,
    };
  } catch (err) {
    // Access was revoked on Spotify's side: forget the connection so the user can reconnect.
    if (err instanceof SpotifyError && (err.status === 400 || err.status === 401)) {
      await prisma.spotifyConnection.deleteMany({ where: { userId: auth.userId } });
      throw new AppError(
        409,
        'SPOTIFY_DISCONNECTED',
        'Spotify access ended. Please connect again.',
      );
    }
    if (err instanceof SpotifyError) {
      throw new AppError(502, 'SPOTIFY_UNAVAILABLE', "Couldn't reach Spotify. Try again shortly.");
    }
    throw err;
  }
}

export async function disconnectSpotify(userId: string) {
  await prisma.spotifyConnection.deleteMany({ where: { userId } });
}
