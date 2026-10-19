import type { User as UserRow } from '@prisma/client';
import type { Session, User, UserImageKind } from '@planner/shared';
import bcrypt from 'bcryptjs';
import type { CookieOptions, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config, isProduction, SESSION_TTL_SECONDS } from '../config.js';
import { prisma } from '../db.js';
import { AppError, notFound } from '../lib/errors.js';
import { parseImageUpload } from '../lib/images.js';
import { toSettingsDTO, toUserDTO, userInclude } from '../lib/serialize.js';

export const SESSION_COOKIE = 'planner_session';
const BCRYPT_ROUNDS = config.NODE_ENV === 'test' ? 4 : 12;
// Used to keep login timing similar whether or not the email exists.
const DUMMY_HASH = bcrypt.hashSync('timing-equalizer-password', BCRYPT_ROUNDS);

interface SessionPayload {
  sub: string;
  ver: number;
}

const cookieOptions: CookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: 'lax',
  path: '/',
};

export function hashPassword(password: string) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export function issueSession(res: Response, user: Pick<UserRow, 'id' | 'tokenVersion'>) {
  const payload: SessionPayload = { sub: user.id, ver: user.tokenVersion };
  const token = jwt.sign(payload, config.JWT_SECRET, {
    expiresIn: SESSION_TTL_SECONDS,
    algorithm: 'HS256',
  });
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions, maxAge: SESSION_TTL_SECONDS * 1000 });
}

export function clearSession(res: Response) {
  res.clearCookie(SESSION_COOKIE, cookieOptions);
}

export function verifySessionToken(token: string): SessionPayload | null {
  try {
    const decoded = jwt.verify(token, config.JWT_SECRET, { algorithms: ['HS256'] });
    if (
      typeof decoded === 'object' &&
      typeof decoded.sub === 'string' &&
      typeof decoded.ver === 'number'
    ) {
      return { sub: decoded.sub, ver: decoded.ver };
    }
    return null;
  } catch {
    return null;
  }
}

export async function registerUser(input: {
  name: string;
  email: string;
  password: string;
  timezone?: string;
}) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw new AppError(409, 'EMAIL_TAKEN', 'An account with this email already exists');

  const passwordHash = await hashPassword(input.password);
  return prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      passwordHash,
      settings: { create: { timezone: input.timezone ?? 'UTC' } },
    },
    include: { settings: true },
  });
}

export async function authenticate(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email }, include: { settings: true } });
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  return user;
}

export async function getSession(userId: string): Promise<Session> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, include: userInclude });
  const settings = await prisma.userSettings.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
  return { user: toUserDTO(user), settings: toSettingsDTO(settings) };
}

export async function updateProfileName(userId: string, name: string): Promise<User> {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { name },
    include: userInclude,
  });
  return toUserDTO(user);
}

const toDbImageKind = (kind: UserImageKind) => kind.toUpperCase() as 'AVATAR';

export async function getUserImage(userId: string, kind: UserImageKind) {
  const image = await prisma.userImage.findUnique({
    where: { userId_kind: { userId, kind: toDbImageKind(kind) } },
    select: { mimeType: true, data: true },
  });
  if (!image) throw notFound('Profile photo');
  return image;
}

export async function setUserImage(
  userId: string,
  kind: UserImageKind,
  data: unknown,
): Promise<User> {
  const { mimeType, bytes } = parseImageUpload(data);
  const dbKind = toDbImageKind(kind);
  await prisma.userImage.upsert({
    where: { userId_kind: { userId, kind: dbKind } },
    create: { userId, kind: dbKind, mimeType, data: bytes },
    update: { mimeType, data: bytes },
  });
  return (await getSession(userId)).user;
}

export async function deleteUserImage(userId: string, kind: UserImageKind): Promise<User> {
  await prisma.userImage.deleteMany({ where: { userId, kind: toDbImageKind(kind) } });
  return (await getSession(userId)).user;
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Current password is incorrect', {
      issues: [{ path: 'currentPassword', message: 'Current password is incorrect' }],
    });
  }
  return prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(newPassword), tokenVersion: { increment: 1 } },
  });
}
