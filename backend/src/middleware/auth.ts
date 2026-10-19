import type { RequestHandler } from 'express';
import { prisma } from '../db.js';
import { AppError } from '../lib/errors.js';
import { SESSION_COOKIE, verifySessionToken } from '../services/authService.js';

const unauthenticated = () => new AppError(401, 'UNAUTHENTICATED', 'Please sign in to continue');

/**
 * Verifies the session cookie and loads the user on every request, so deleted
 * users and sessions revoked by a password change are rejected immediately.
 */
export const requireAuth: RequestHandler = async (req, _res, next) => {
  const token: unknown = req.cookies?.[SESSION_COOKIE];
  if (typeof token !== 'string') throw unauthenticated();

  const payload = verifySessionToken(token);
  if (!payload) throw unauthenticated();

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    include: { settings: true },
  });
  if (!user || user.tokenVersion !== payload.ver) throw unauthenticated();

  req.auth = {
    userId: user.id,
    email: user.email,
    name: user.name,
    timezone: user.settings?.timezone ?? 'UTC',
    weekStartsOn: user.settings?.weekStartsOn === 0 ? 0 : 1,
    defaultPriority: user.settings?.defaultPriority ?? 'MEDIUM',
  };
  next();
};
