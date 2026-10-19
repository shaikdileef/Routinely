import { Router } from 'express';
import { runSystemChecks } from '../services/systemService.js';

export const systemRouter = Router();

/** Tests the database, scheduler and each outside service with the configured keys. */
systemRouter.get('/checks', async (_req, res) => {
  res.json({ data: await runSystemChecks() });
});
