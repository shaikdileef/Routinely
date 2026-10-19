import type { ApiErrorBody, ApiErrorIssue } from '@planner/shared';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly issues: ApiErrorIssue[] = [],
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
  }

  /** Field-level messages keyed by path, for showing next to form inputs. */
  fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const i of this.issues) if (!out[i.path]) out[i.path] = i.message;
    return out;
  }
}

type Query = Record<string, string | number | undefined | null>;

function buildUrl(path: string, query?: Query) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  }
  const qs = params.toString();
  return `/api${path}${qs ? `?${qs}` : ''}`;
}

/** Fires when any request comes back 401, so the app can drop its session. */
export const UNAUTHORIZED_EVENT = 'planner:unauthorized';

export async function request<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  /** `body` is sent as JSON; `file` is sent as-is (e.g. an image upload). */
  options: { body?: unknown; file?: Blob; query?: Query } = {},
): Promise<T> {
  const { body, file } = options;
  let contentType: string | undefined;
  if (file) contentType = file.type || 'application/octet-stream';
  else if (body !== undefined) contentType = 'application/json';

  let res: Response;
  try {
    res = await fetch(buildUrl(path, options.query), {
      method,
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        'X-Requested-With': 'planner',
        ...(contentType ? { 'Content-Type': contentType } : {}),
      },
      body: file ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
  } catch {
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      'Cannot reach the server. Check your connection and try again.',
    );
  }

  if (res.status === 204) return undefined as T;

  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    // fall through: non-JSON response
  }

  if (!res.ok) {
    const err = (json as ApiErrorBody | null)?.error;
    if (res.status === 401 && !path.startsWith('/auth/login')) {
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }
    throw new ApiError(
      res.status,
      err?.code ?? 'HTTP_ERROR',
      err?.message ?? `Request failed (${res.status})`,
      err?.issues ?? [],
      err?.details ?? {},
    );
  }
  if (json === null)
    throw new ApiError(res.status, 'INVALID_RESPONSE', 'The server returned an invalid response');
  return json as T;
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Something went wrong';
}
