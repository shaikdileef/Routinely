import { computeDashboardStats, todayInTimeZone, type Session, type Task } from '@planner/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { vi } from 'vitest';
import { App } from '../App';
import { AuthProvider } from '../context/AuthContext';
import { ToastProvider } from '../context/ToastContext';

export interface ApiCall {
  method: string;
  path: string;
  query: URLSearchParams;
  body: unknown;
}

type Reply = { status?: number; body?: unknown };
type Handler = (call: ApiCall) => Reply | Promise<Reply>;

export const session: Session = {
  user: {
    id: 'u1',
    email: 'ada@example.com',
    name: 'Ada Lovelace',
    avatarUrl: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  settings: {
    theme: 'LIGHT',
    colorTheme: 'LAVENDER',
    notifyEmail: null,
    notifyPhone: null,
    emailReminders: true,
    whatsappReminders: false,
    weekStartsOn: 1,
    timezone: 'UTC',
    defaultPriority: 'MEDIUM',
  },
};

export const today = () => todayInTimeZone('UTC');

let seq = 0;
export function makeTask(overrides: Partial<Task> = {}): Task {
  seq += 1;
  return {
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
    title: `Task ${seq}`,
    description: null,
    notes: null,
    dueDate: null,
    startDate: null,
    startTime: null,
    endTime: null,
    priority: 'MEDIUM',
    status: 'TODO',
    categoryId: null,
    category: null,
    tags: [],
    estimatedMinutes: null,
    images: { before: null, after: null },
    completedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const list = (tasks: Task[]) => ({
  data: tasks,
  meta: { page: 1, pageSize: 50, total: tasks.length, totalPages: 1 },
});

/** Installs a fetch mock routing "METHOD /path" to handlers; returns the recorded calls. */
export function mockApi(
  overrides: Record<string, Handler> = {},
  opts: { tasks?: Task[]; signedIn?: boolean } = {},
) {
  const tasks = opts.tasks ?? [];
  const defaults: Record<string, Handler> = {
    'GET /auth/me': () =>
      opts.signedIn === false
        ? { status: 401, body: { error: { code: 'UNAUTHENTICATED', message: 'Please sign in' } } }
        : { body: { data: session } },
    'GET /categories': () => ({ body: { data: [] } }),
    'GET /habits': () => ({ body: { data: [] } }),
    'GET /spotify/status': () => ({
      body: { data: { configured: false, connected: false, displayName: null } },
    }),
    'GET /settings/notifications': () => ({
      body: { data: { email: 'live', whatsapp: 'live' } },
    }),
    'GET /settings/notifications/log': () => ({ body: { data: [] } }),
    'GET /tasks': () => ({ body: list(tasks) }),
    'GET /dashboard': () => ({
      body: {
        data: computeDashboardStats({
          tasks,
          today: today(),
          timezone: 'UTC',
          totals: {
            all: tasks.length,
            completed: tasks.filter((t) => t.status === 'COMPLETED').length,
          },
        }),
      },
    }),
  };
  const handlers = { ...defaults, ...overrides };
  const calls: ApiCall[] = [];

  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input), 'http://localhost');
    const path = url.pathname.replace(/^\/api/, '');
    const method = (init?.method ?? 'GET').toUpperCase();
    const call: ApiCall = {
      method,
      path,
      query: url.searchParams,
      // JSON bodies are parsed; file uploads are recorded as the Blob itself.
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : (init?.body ?? undefined),
    };
    calls.push(call);
    const handler =
      handlers[`${method} ${path}`] ??
      handlers[`${method} ${path.replace(/\/[0-9a-f-]{36}$/, '/:id')}`];
    const reply = handler
      ? await handler(call)
      : {
          status: 404,
          body: { error: { code: 'NOT_FOUND', message: `No mock for ${method} ${path}` } },
        };
    const status = reply.status ?? 200;
    return new Response(status === 204 ? null : JSON.stringify(reply.body ?? {}), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  });

  return calls;
}

export function renderApp(route = '/') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>
        <ToastProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
