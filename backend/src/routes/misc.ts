import { notificationTestSchema, settingsUpdateSchema } from '@planner/shared';
import { Router } from 'express';
import { getAuth, parse } from '../lib/http.js';
import { notificationAvailability } from '../notifications/index.js';
import { getSession } from '../services/authService.js';
import { getDashboard } from '../services/dashboardService.js';
import { listDeliveries, sendTestNotification } from '../services/reminderService.js';
import { updateSettings } from '../services/settingsService.js';

export const dashboardRouter = Router();

dashboardRouter.get('/', async (req, res) => {
  res.json({ data: await getDashboard(getAuth(req)) });
});

export const settingsRouter = Router();

settingsRouter.get('/', async (req, res) => {
  res.json({ data: (await getSession(getAuth(req).userId)).settings });
});

settingsRouter.patch('/', async (req, res) => {
  res.json({
    data: await updateSettings(getAuth(req).userId, parse(settingsUpdateSchema, req.body)),
  });
});

/** Which notification channels the server has credentials for. */
settingsRouter.get('/notifications', (_req, res) => {
  res.json({ data: notificationAvailability() });
});

settingsRouter.post('/notifications/test', async (req, res) => {
  const { channel } = parse(notificationTestSchema, req.body);
  res.json({ data: await sendTestNotification(getAuth(req).userId, channel) });
});

/** The 20 most recent messages sent (or previewed) for this user. */
settingsRouter.get('/notifications/log', async (req, res) => {
  res.json({ data: await listDeliveries(getAuth(req).userId) });
});
