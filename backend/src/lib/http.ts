import { idSchema } from '@planner/shared';
import type { Request } from 'express';
import type { ZodTypeAny, z } from 'zod';
import { AppError, notFound } from './errors.js';

/** Parses with a zod schema; ZodErrors are turned into 400 responses by the error handler. */
export function parse<T extends ZodTypeAny>(schema: T, data: unknown): z.output<T> {
  return schema.parse(data);
}

/** Route ids that are not UUIDs can never exist, so they are reported as 404. */
export function parseId(value: unknown, what = 'Resource'): string {
  const r = idSchema.safeParse(value);
  if (!r.success) throw notFound(what);
  return r.data;
}

export interface AuthContext {
  userId: string;
  email: string;
  name: string;
  timezone: string;
  weekStartsOn: 0 | 1;
  defaultPriority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
}

export function getAuth(req: Request): AuthContext {
  if (!req.auth) throw new AppError(401, 'UNAUTHENTICATED', 'Please sign in to continue');
  return req.auth;
}
