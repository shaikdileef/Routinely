import { Prisma } from '@prisma/client';
import type { ApiErrorBody, ApiErrorIssue } from '@planner/shared';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly extra: { issues?: ApiErrorIssue[]; details?: Record<string, unknown> } = {},
  ) {
    super(message);
  }
}

export const notFound = (what = 'Resource') => new AppError(404, 'NOT_FOUND', `${what} not found`);

export const validationError = (issues: ApiErrorIssue[]) =>
  new AppError(400, 'VALIDATION_ERROR', issues[0]?.message ?? 'Invalid request', { issues });

export function zodIssues(err: ZodError): ApiErrorIssue[] {
  return err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
}

export const apiNotFoundHandler: RequestHandler = (req, _res, next) => {
  next(new AppError(404, 'NOT_FOUND', `No route for ${req.method} ${req.originalUrl}`));
};

function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof ZodError) return validationError(zodIssues(err));
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002')
      return new AppError(409, 'CONFLICT', 'A record with these values already exists');
    if (err.code === 'P2025') return notFound();
  }
  if (typeof err === 'object' && err !== null && 'type' in err) {
    const type = (err as { type: string }).type;
    if (type === 'entity.parse.failed')
      return new AppError(400, 'INVALID_JSON', 'Request body is not valid JSON');
    if (type === 'entity.too.large')
      return new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
  }
  return new AppError(500, 'INTERNAL_ERROR', 'Something went wrong. Please try again.');
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const appError = toAppError(err);
  if (appError.status >= 500) {
    console.error(`[${req.method} ${req.originalUrl}]`, err);
  }
  const body: ApiErrorBody = {
    error: { code: appError.code, message: appError.message, ...appError.extra },
  };
  res.status(appError.status).json(body);
};
