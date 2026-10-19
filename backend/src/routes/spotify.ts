import { Router, type RequestHandler } from 'express';
import { config } from '../config.js';
import { getAuth } from '../lib/http.js';
import {
  completeSpotifyConnection,
  disconnectSpotify,
  getSpotifyStatus,
  getSpotifySummary,
  spotifyConnectUrl,
} from '../services/spotifyService.js';

/** Routes for a signed-in user. */
export const spotifyRouter = Router();

spotifyRouter.get('/status', async (req, res) => {
  res.json({ data: await getSpotifyStatus(getAuth(req).userId) });
});

/** Returns the Spotify sign-in URL; the browser then navigates there. */
spotifyRouter.post('/connect', (req, res) => {
  res.json({ data: { url: spotifyConnectUrl(getAuth(req).userId) } });
});

spotifyRouter.get('/summary', async (req, res) => {
  res.json({ data: await getSpotifySummary(getAuth(req)) });
});

spotifyRouter.delete('/', async (req, res) => {
  await disconnectSpotify(getAuth(req).userId);
  res.status(204).end();
});

/**
 * Spotify redirects the browser here after sign-in. It is not behind the session cookie: the
 * signed `state` identifies the user. Ends by sending the browser back to the app.
 */
export const spotifyCallback: RequestHandler = async (req, res) => {
  const text = (v: unknown) => (typeof v === 'string' ? v : undefined);
  const outcome = await completeSpotifyConnection(
    text(req.query.code),
    text(req.query.state),
    text(req.query.error),
  );
  const reason = outcome.result === 'error' ? `&reason=${outcome.reason}` : '';
  res.redirect(`${config.APP_URL}/?spotify=${outcome.result}${reason}`);
};
