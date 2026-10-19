# Routinely

A full-stack daily planner: tasks, a live dashboard, Today / Upcoming / Calendar views, categories, habit tracking with schedule-aware streaks, and per-user settings. Data is stored in PostgreSQL.

| Layer    | Tech                                                                                  |
| -------- | ------------------------------------------------------------------------------------- |
| Frontend | React 19, TypeScript, Vite, React Router 7, TanStack Query, CSS Modules, Lucide icons |
| Backend  | Node.js, Express 5, TypeScript, Zod validation                                        |
| Database | PostgreSQL + Prisma ORM (migrations in `backend/prisma/migrations`)                   |
| Tests    | Vitest, Supertest (API against a real test database), Testing Library (UI)            |

## Project structure

```
routinely/
├─ shared/            # Used by BOTH frontend and backend: one source of truth for the API contract
│  └─ src/            #   constants, Zod schemas, DTO types, date utils, streak + dashboard calculators
├─ backend/
│  ├─ prisma/         #   schema.prisma + SQL migrations
│  ├─ src/
│  │  ├─ routes/      #   thin HTTP layer: parse → call service → respond
│  │  ├─ services/    #   business logic + ownership checks (all queries are scoped by userId)
│  │  ├─ middleware/  #   requireAuth, CSRF guard, rate limiting
│  │  └─ lib/         #   central error handling, serializers, helpers
│  └─ tests/          #   API integration tests
└─ frontend/
   └─ src/
      ├─ api/         #   fetch wrapper (typed errors) + endpoint functions
      ├─ hooks/       #   React Query hooks, URL-synced filters, timezone-aware "today"
      ├─ context/     #   auth/session, toasts, shared task editor
      ├─ components/  #   ui/ primitives, layout/ shell, tasks/, habits/, dashboard/
      ├─ pages/       #   one component per route
      └─ styles/      #   design tokens (light + dark) and global CSS
```

## Setup

### 1. PostgreSQL

Install PostgreSQL 14+ (tested with 18), then create a role and database:

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -h localhost
```

```sql
CREATE ROLE planner WITH LOGIN PASSWORD 'choose_a_password' CREATEDB;
CREATE DATABASE daily_planner OWNER planner;
\q
```

`CREATEDB` lets Prisma create its shadow database during `migrate dev`, and lets the test suite create `daily_planner_test`.

### 2. Environment

`backend/.env` holds all configuration. Copy the template if you don't have one yet:

```powershell
Copy-Item backend\.env.example backend\.env
```

Then edit `backend/.env`:

- `DATABASE_URL`: replace `CHANGE_ME` with the role's password
- `TEST_DATABASE_URL`: same password. This must be a **separate** database whose name contains `test`, because tests wipe it.
- `JWT_SECRET`: at least 32 random characters. Generate one with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.

No secrets live in the frontend. The browser only ever holds an httpOnly session cookie.

### 3. Install, migrate, run

```powershell
npm install           # installs all three workspaces
npm run db:deploy     # applies migrations to DATABASE_URL
npm run dev           # shared (watch) + API on :4000 + web on :5173
```

Open http://localhost:5173 and create an account.

> npm 11+ blocks dependency install scripts by default. The root `package.json` already allow-lists Prisma and esbuild. If Prisma complains that its engines are missing, run `npm rebuild prisma @prisma/client @prisma/engines`.

### Production build

```powershell
npm run build
$env:NODE_ENV="production"; $env:FRONTEND_DIST="..\frontend\dist"; npm start
```

With `FRONTEND_DIST` set, the API also serves the built SPA on port 4000. Set `NODE_ENV=production` so cookies are marked `Secure` (requires HTTPS).

## Scripts (run from the repo root)

| Command              | What it does                                                                    |
| -------------------- | ------------------------------------------------------------------------------- |
| `npm run dev`        | Run everything in watch mode                                                    |
| `npm run build`      | Build shared, backend (`backend/dist/`) and frontend (`frontend/dist/`)         |
| `npm test`           | Shared unit tests, API integration tests, UI tests                              |
| `npm run typecheck`  | `tsc --noEmit` in every workspace                                               |
| `npm run lint`       | ESLint (TypeScript + React hooks rules)                                         |
| `npm run format`     | Prettier: format every file in place (`format:check` verifies only)             |
| `npm run db:migrate` | `prisma migrate dev`: create and apply a new migration after editing the schema |
| `npm run db:deploy`  | `prisma migrate deploy`: apply pending migrations (never resets data)           |

## API

All endpoints live under `/api` and return JSON:

- Success: `{ "data": … }`, plus `meta` for paginated lists
- Error: `{ "error": { "code", "message", "issues"?: [{ "path", "message" }] } }`

Every state-changing request needs the header `X-Requested-With: planner` (CSRF defence). Everything except `/auth/register`, `/auth/login` and `/health` requires a session.

| Method           | Path                                            | Notes                                                                                                                                                                                                                                 |
| ---------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST             | `/auth/register`, `/auth/login`, `/auth/logout` | Sets/clears the httpOnly session cookie; rate limited                                                                                                                                                                                 |
| GET              | `/auth/me`                                      | Current user + settings                                                                                                                                                                                                               |
| PATCH            | `/auth/profile`                                 | `{ name }`                                                                                                                                                                                                                            |
| POST             | `/auth/password`                                | `{ currentPassword, newPassword }`; revokes other sessions                                                                                                                                                                            |
| GET/PATCH        | `/settings`                                     | theme, weekStartsOn, timezone, defaultPriority                                                                                                                                                                                        |
| GET              | `/tasks`                                        | `view=all\|open\|today\|upcoming\|overdue\|completed\|nodate`, `search`, `status`, `priority`, `categoryId` (or `none`), `tag`, `from`, `to`, `sort=dueDate\|priority\|createdAt\|completedAt`, `order`, `page`, `pageSize` (max 500) |
| POST             | `/tasks`                                        | Optional `clientRequestId` (UUID) makes create idempotent (201 first time, 200 on repeat)                                                                                                                                             |
| GET/PATCH/DELETE | `/tasks/:id`                                    | Completing sets `completedAt`; reopening clears it                                                                                                                                                                                    |
| GET/POST         | `/categories`                                   | List includes `taskCount` and `completedCount`                                                                                                                                                                                        |
| PATCH            | `/categories/:id`                               | Rename / recolor                                                                                                                                                                                                                      |
| DELETE           | `/categories/:id?reassignTo=<id>\|none`         | Returns **409** if the category has tasks and no `reassignTo` is given; tasks are never deleted                                                                                                                                       |
| GET/POST         | `/habits`                                       | Each habit includes completions and computed stats                                                                                                                                                                                    |
| GET/PATCH/DELETE | `/habits/:id`                                   |                                                                                                                                                                                                                                       |
| PUT/DELETE       | `/habits/:id/completions/:date`                 | Mark/unmark a date (idempotent); rejects future and unscheduled dates                                                                                                                                                                 |
| GET              | `/dashboard`                                    | All statistics computed from stored tasks                                                                                                                                                                                             |

## Design decisions

- **Dates and timezones.** Due dates are calendar dates (`date` columns, `"YYYY-MM-DD"` in the API), never timestamps, so they can't shift between timezones. "Today", "overdue" and dashboard buckets are computed in the user's chosen IANA timezone (set at registration from the browser, changeable in Settings). Date arithmetic is done in UTC so DST never skews it. A task becomes overdue once its due _date_ has passed. Nothing is ever completed automatically.
- **No fake success.** The UI is not optimistic. Checkboxes and forms wait for the server, show a pending state, and surface errors via toasts or inline messages. Lists refetch after confirmed writes.
- **Duplicate prevention.** Submit buttons disable while saving, a synchronous guard blocks double submits, and creates carry an idempotency key enforced by a unique `(userId, clientRequestId)` index.
- **Ownership.** Every query is scoped by `userId`. Other users' resources return 404, so their existence isn't revealed. Category assignment checks that the category belongs to the same user.
- **Streaks** count consecutive _scheduled_ days (daily, or specific weekdays). Unscheduled days neither break nor extend a streak, and today doesn't break a streak until it's over.
- **Sessions.** JWT in an httpOnly, SameSite=Lax cookie (Secure in production), bcrypt-hashed passwords, a per-user `tokenVersion` so a password change revokes other sessions, plus helmet and login rate limiting.
- **Calendar** is built on the shared date utilities rather than a calendar library. Month/week/day grids are about 20 lines of date math and stay consistent with the server's date handling.

## Known limitations / next steps

- Notifications and reminders are not implemented, so there are no notification settings.
- Recurring _tasks_ are not supported. Use habits for recurring routines.
- Calendar and Upcoming show up to 500 tasks per range.
- No email verification or password reset by email.
- No end-to-end browser tests (Playwright). UI behaviour is covered by component tests in jsdom.
