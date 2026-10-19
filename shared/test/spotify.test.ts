import { describe, expect, it } from 'vitest';
import { summarizeListeningDay, type SpotifyPlay } from '../src/index.js';

const play = (playedAt: string, artist: string, minutes = 3): SpotifyPlay => ({
  id: playedAt,
  name: `Song at ${playedAt}`,
  artists: [artist, 'Featured Artist'],
  album: 'Album',
  imageUrl: null,
  url: 'https://open.spotify.com/track/x',
  durationMs: minutes * 60_000,
  playedAt,
});

describe('summarizeListeningDay', () => {
  it("adds up today's plays in the user's timezone and finds the top artist", () => {
    const plays = [
      play('2026-10-19T04:00:00Z', 'Arijit Singh', 4), // 09:30 in Kolkata
      play('2026-10-19T05:00:00Z', 'Arijit Singh', 5),
      play('2026-10-19T06:00:00Z', 'A. R. Rahman', 3),
      play('2026-10-18T20:00:00Z', 'A. R. Rahman', 6), // 01:30 on the 19th in Kolkata
      play('2026-10-18T10:00:00Z', 'Old Song', 3), // the 18th
    ];
    expect(summarizeListeningDay(plays, 'Asia/Kolkata', '2026-10-19')).toEqual({
      minutes: 18,
      plays: 4,
      topArtist: 'A. R. Rahman', // tie broken by name
    });
  });

  it('reports a quiet day as zero', () => {
    expect(summarizeListeningDay([], 'UTC', '2026-10-19')).toEqual({
      minutes: 0,
      plays: 0,
      topArtist: null,
    });
  });
});
