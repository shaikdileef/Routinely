import type { RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { config } from '../config.js';
import { AppError } from '../lib/errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
export const CSRF_HEADER = 'x-requested-with';
export const CSRF_HEADER_VALUE = 'planner';

/**
 * CSRF defence in depth on top of SameSite=Lax cookies: state-changing requests
 * must carry a custom header, which cross-site forms cannot send and cross-origin
 * scripts cannot send without a CORS preflight this API never approves.
 */
export const csrfGuard: RequestHandler = (req, _res, next) => {
  if (SAFE_METHODS.has(req.method) || req.get(CSRF_HEADER) === CSRF_HEADER_VALUE) return next();
  next(new AppError(403, 'CSRF_REJECTED', 'Missing or invalid request header'));
};

export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => config.NODE_ENV === 'test',
  handler: (_req, _res, next) =>
    next(
      new AppError(
        429,
        'RATE_LIMITED',
        'Too many attempts. Please wait a few minutes and try again.',
      ),
    ),
});
