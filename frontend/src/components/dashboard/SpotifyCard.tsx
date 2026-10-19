import type { SpotifySummary } from '@planner/shared';
import { ExternalLink, Music } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { errorMessage } from '../../api/client';
import { spotifyApi } from '../../api/endpoints';
import { useToast } from '../../context/ToastContext';
import { useDisconnectSpotify, useSpotifyStatus, useSpotifySummary } from '../../hooks/queries';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { ErrorState, LoadingState } from '../ui/Feedback';
import styles from './Spotify.module.css';

const CALLBACK_MESSAGES = {
  connected: { ok: true, text: 'Spotify connected' },
  denied: { ok: false, text: 'Spotify connection was cancelled' },
  error: { ok: false, text: "Couldn't connect Spotify. Please try again." },
} as const;

/** Why a connection failed (?reason=… from the backend), in words that say what to do. */
const FAILURE_MESSAGES: Record<string, string> = {
  not_allowed:
    "Spotify signed you in but won't share your data with this app. On developer.spotify.com, add your Spotify account's email under User Management. New apps may also need the owner to have Spotify Premium.",
  rejected:
    'Spotify rejected the sign-in. Check that the Redirect URI on your Spotify app is exactly http://127.0.0.1:4000/api/spotify/callback, then try again.',
  expired: 'The sign-in took too long or was opened in another account. Please try again.',
  not_configured: 'Spotify keys are missing on the server. Add them to backend/.env and restart.',
};

function timeAgo(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} h ago` : `${Math.round(hours / 24)} d ago`;
}

/** Shows the result of returning from Spotify's sign-in (?spotify=…) once, then tidies the URL. */
function useSpotifyCallbackToast() {
  const [params, setParams] = useSearchParams();
  const toast = useToast();
  const result = params.get('spotify') as keyof typeof CALLBACK_MESSAGES | null;
  // Effects can run twice (StrictMode, re-renders) before the URL is tidied; toast only once.
  const shown = useRef(false);

  useEffect(() => {
    if (!result || shown.current) return;
    shown.current = true;
    const message = CALLBACK_MESSAGES[result];
    const reason = params.get('reason');
    const detail = reason ? FAILURE_MESSAGES[reason] : undefined;
    if (message) (message.ok ? toast.success : toast.error)(detail ?? message.text);
    const next = new URLSearchParams(params);
    next.delete('spotify');
    next.delete('reason');
    setParams(next, { replace: true });
  }, [result, params, setParams, toast]);
}

/** Dashboard card: connect Spotify and see how you've been listening. */
export function SpotifyCard() {
  useSpotifyCallbackToast();
  const status = useSpotifyStatus();
  const connected = status.data?.connected ?? false;
  const summary = useSpotifySummary(connected);

  return (
    <Card
      title={
        <span className={styles.title}>
          <span className={styles.logo} aria-hidden>
            <Music size={14} />
          </span>
          Spotify
        </span>
      }
    >
      {status.isPending ? (
        <LoadingState label="Checking Spotify…" />
      ) : status.isError ? (
        <ErrorState error={status.error} onRetry={() => status.refetch()} />
      ) : !connected ? (
        <ConnectPrompt configured={status.data.configured} />
      ) : summary.isPending ? (
        <LoadingState label="Loading your listening…" />
      ) : summary.isError ? (
        <ErrorState error={summary.error} onRetry={() => summary.refetch()} />
      ) : (
        <Listening summary={summary.data} account={status.data.displayName} />
      )}
    </Card>
  );
}

function ConnectPrompt({ configured }: { configured: boolean }) {
  const toast = useToast();
  const [connecting, setConnecting] = useState(false);

  async function connect() {
    setConnecting(true);
    try {
      const { url } = await spotifyApi.connectUrl();
      window.location.assign(url);
    } catch (err) {
      toast.error(errorMessage(err));
      setConnecting(false);
    }
  }

  return (
    <div className={styles.prompt}>
      <p>
        Connect your Spotify to see how you've been listening: what's playing, today's minutes, and
        your top artists. The app can only read your listening, never change anything.
      </p>
      {configured ? (
        <button type="button" className={styles.connect} onClick={connect} disabled={connecting}>
          <Music size={16} aria-hidden /> {connecting ? 'Opening Spotify…' : 'Connect Spotify'}
        </button>
      ) : (
        <p className={styles.setup}>
          Spotify needs a one-time setup on the server: add SPOTIFY_CLIENT_ID and
          SPOTIFY_CLIENT_SECRET to backend/.env (instructions are next to them).
        </p>
      )}
    </div>
  );
}

function Listening({ summary, account }: { summary: SpotifySummary; account: string | null }) {
  const toast = useToast();
  const disconnect = useDisconnectSpotify();
  const { today, nowPlaying, recent, topArtists } = summary;

  async function onDisconnect() {
    try {
      await disconnect.mutateAsync();
      toast.success('Spotify disconnected');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <div className={styles.listening}>
      <p className={styles.headline}>
        {today.plays > 0 ? (
          <>
            You've listened to <strong>{today.minutes} min</strong> of music today across{' '}
            <strong>
              {today.plays} {today.plays === 1 ? 'song' : 'songs'}
            </strong>
            {today.topArtist && (
              <>
                , mostly <strong>{today.topArtist}</strong>
              </>
            )}
            .
          </>
        ) : (
          'No music yet today. Here is what you played recently.'
        )}
      </p>

      {nowPlaying && (
        <a className={styles.nowPlaying} href={nowPlaying.url} target="_blank" rel="noreferrer">
          {nowPlaying.imageUrl && <img src={nowPlaying.imageUrl} alt="" className={styles.art} />}
          <span className={styles.trackText}>
            <span className={styles.nowLabel}>
              {nowPlaying.isPlaying ? (
                <span className={styles.equalizer} aria-hidden>
                  <i />
                  <i />
                  <i />
                </span>
              ) : null}
              {nowPlaying.isPlaying ? 'Now playing' : 'Paused'}
            </span>
            <strong>{nowPlaying.name}</strong>
            <span>{nowPlaying.artists.join(', ')}</span>
          </span>
          <ExternalLink size={14} aria-label="Open in Spotify" className={styles.external} />
        </a>
      )}

      {topArtists.length > 0 && (
        <section aria-label="Top artists this month">
          <h3 className={styles.sectionTitle}>Top artists this month</h3>
          <ul className={styles.artists}>
            {topArtists.slice(0, 5).map((a) => (
              <li key={a.id}>
                <a href={a.url} target="_blank" rel="noreferrer" title={a.name}>
                  {a.imageUrl ? (
                    <img src={a.imageUrl} alt="" />
                  ) : (
                    <span className={styles.initial}>{a.name[0]}</span>
                  )}
                  <span>{a.name}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {recent.length > 0 && (
        <section aria-label="Recently played">
          <h3 className={styles.sectionTitle}>Recently played</h3>
          <ul className={styles.recent}>
            {recent.slice(0, 4).map((p) => (
              <li key={`${p.id}-${p.playedAt}`}>
                <a href={p.url} target="_blank" rel="noreferrer">
                  {p.imageUrl && <img src={p.imageUrl} alt="" className={styles.smallArt} />}
                  <span className={styles.trackText}>
                    <strong>{p.name}</strong>
                    <span>{p.artists.join(', ')}</span>
                  </span>
                  <time dateTime={p.playedAt}>{timeAgo(p.playedAt)}</time>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className={styles.footer}>
        <span>{account ? `Connected as ${account}` : 'Connected'}</span>
        <Button size="sm" variant="ghost" onClick={onDisconnect} loading={disconnect.isPending}>
          Disconnect
        </Button>
      </div>
    </div>
  );
}
