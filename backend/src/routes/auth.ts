import {
  loginSchema,
  passwordChangeSchema,
  profileUpdateSchema,
  registerSchema,
  USER_IMAGE_KINDS,
  type UserImageKind,
} from '@planner/shared';
import { Router } from 'express';
import { notFound } from '../lib/errors.js';
import { getAuth, parse } from '../lib/http.js';
import { IMMUTABLE_CACHE, rawImageBody } from '../lib/images.js';
import { requireAuth } from '../middleware/auth.js';
import { authRateLimit } from '../middleware/security.js';
import {
  authenticate,
  changePassword,
  clearSession,
  deleteUserImage,
  getSession,
  getUserImage,
  issueSession,
  registerUser,
  setUserImage,
  updateProfileName,
} from '../services/authService.js';

export const authRouter = Router();

authRouter.post('/register', authRateLimit, async (req, res) => {
  const input = parse(registerSchema, req.body);
  const user = await registerUser(input);
  issueSession(res, user);
  res.status(201).json({ data: await getSession(user.id) });
});

authRouter.post('/login', authRateLimit, async (req, res) => {
  const input = parse(loginSchema, req.body);
  const user = await authenticate(input.email, input.password);
  issueSession(res, user);
  res.json({ data: await getSession(user.id) });
});

authRouter.post('/logout', (_req, res) => {
  clearSession(res);
  res.status(204).end();
});

authRouter.get('/me', requireAuth, async (req, res) => {
  res.json({ data: await getSession(getAuth(req).userId) });
});

authRouter.patch('/profile', requireAuth, async (req, res) => {
  const input = parse(profileUpdateSchema, req.body);
  res.json({ data: await updateProfileName(getAuth(req).userId, input.name) });
});

function parseUserImageKind(value: unknown): UserImageKind {
  if (typeof value !== 'string' || !(USER_IMAGE_KINDS as readonly string[]).includes(value)) {
    throw notFound('Image');
  }
  return value as UserImageKind;
}

/** The signed-in user's own images (their profile photo). */
authRouter.get('/images/:kind', requireAuth, async (req, res) => {
  const image = await getUserImage(getAuth(req).userId, parseUserImageKind(req.params.kind));
  res.setHeader('Cache-Control', IMMUTABLE_CACHE);
  res.type(image.mimeType).send(Buffer.from(image.data));
});

authRouter.put('/images/:kind', requireAuth, rawImageBody, async (req, res) => {
  const kind = parseUserImageKind(req.params.kind);
  res.json({ data: await setUserImage(getAuth(req).userId, kind, req.body) });
});

authRouter.delete('/images/:kind', requireAuth, async (req, res) => {
  const kind = parseUserImageKind(req.params.kind);
  res.json({ data: await deleteUserImage(getAuth(req).userId, kind) });
});

/** Changing the password revokes every other session and re-issues this one. */
authRouter.post('/password', requireAuth, authRateLimit, async (req, res) => {
  const input = parse(passwordChangeSchema, req.body);
  const user = await changePassword(getAuth(req).userId, input.currentPassword, input.newPassword);
  issueSession(res, user);
  res.status(204).end();
});
