import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { prisma } from './db.js';
import { apiNotFoundHandler, errorHandler } from './lib/errors.js';
import { requireAuth } from './middleware/auth.js';
import { csrfGuard } from './middleware/security.js';
import { authRouter } from './routes/auth.js';
import { categoriesRouter } from './routes/categories.js';
import { habitsRouter } from './routes/habits.js';
import { dashboardRouter, settingsRouter } from './routes/misc.js';
import { spotifyCallback, spotifyRouter } from './routes/spotify.js';
import { systemRouter } from './routes/system.js';
import { tasksRouter } from './routes/tasks.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('query parser', 'simple');

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          // Album art and artist photos for the Spotify card.
          'img-src': ["'self'", 'data:', 'https://*.scdn.co', 'https://*.spotifycdn.com'],
        },
      },
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  const api = express.Router();
  api.use(csrfGuard);
  api.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  api.get('/health', async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ data: { status: 'ok' } });
  });
  api.use('/auth', authRouter);
  api.use('/tasks', requireAuth, tasksRouter);
  api.use('/categories', requireAuth, categoriesRouter);
  api.use('/habits', requireAuth, habitsRouter);
  api.use('/dashboard', requireAuth, dashboardRouter);
  api.use('/settings', requireAuth, settingsRouter);
  // Spotify's redirect after sign-in carries its own signed state, not the session cookie.
  api.get('/spotify/callback', spotifyCallback);
  api.use('/spotify', requireAuth, spotifyRouter);
  api.use('/system', requireAuth, systemRouter);
  api.use(apiNotFoundHandler);

  app.use('/api', api);

  // In production the API can also serve the built frontend as a single-page app.
  if (config.FRONTEND_DIST) {
    const dist = path.resolve(config.FRONTEND_DIST);
    if (existsSync(path.join(dist, 'index.html'))) {
      app.use(express.static(dist, { index: false, maxAge: '1h' }));
      app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
    }
  }

  app.use(errorHandler);
  return app;
}
