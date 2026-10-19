import { dateKeyInTimeZone, type DateKey } from './dates.js';

export interface SpotifyTrack {
  id: string;
  name: string;
  artists: string[];
  album: string;
  imageUrl: string | null;
  /** Opens the track in Spotify. */
  url: string;
  durationMs: number;
}

export interface SpotifyPlay extends SpotifyTrack {
  /** ISO instant the track was played. */
  playedAt: string;
}

export interface SpotifyArtist {
  id: string;
  name: string;
  imageUrl: string | null;
  url: string;
}

export interface SpotifyStatus {
  /** The server has Spotify app credentials. */
  configured: boolean;
  connected: boolean;
  displayName: string | null;
}

export interface ListeningDay {
  minutes: number;
  plays: number;
  /** The artist played most that day (first listed artist of each track), or null. */
  topArtist: string | null;
}

export interface SpotifySummary {
  nowPlaying: (SpotifyTrack & { isPlaying: boolean }) | null;
  today: ListeningDay;
  /** Most recent first. Spotify only shares the last 50 plays. */
  recent: SpotifyPlay[];
  /** Over roughly the last 4 weeks. */
  topArtists: SpotifyArtist[];
  topTracks: SpotifyTrack[];
}

/** Sums up the plays that happened on `day` in the user's timezone. */
export function summarizeListeningDay(
  plays: SpotifyPlay[],
  timeZone: string,
  day: DateKey,
): ListeningDay {
  const onDay = plays.filter((p) => dateKeyInTimeZone(new Date(p.playedAt), timeZone) === day);
  const perArtist = new Map<string, number>();
  for (const p of onDay) {
    const artist = p.artists[0];
    if (artist) perArtist.set(artist, (perArtist.get(artist) ?? 0) + 1);
  }
  const topArtist =
    [...perArtist.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ??
    null;
  return {
    minutes: Math.round(onDay.reduce((sum, p) => sum + p.durationMs, 0) / 60_000),
    plays: onDay.length,
    topArtist,
  };
}
