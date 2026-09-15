# SecureDesk — Enterprise IT Helpdesk & Asset Management Platform

Full-stack implementation of the SecureDesk specification (see `SECUREDESK-README.md`,
`SECUREDESK-FRONTEND.md`, `SECUREDESK-BACKEND.md` for the source specifications).

| Layer    | Stack |
|----------|-------|
| Frontend | React 18 + TypeScript + Vite, TanStack Query, React Hook Form + Zod, Tailwind CSS, Recharts |
| Backend  | NestJS 10 + TypeScript, Prisma ORM, Argon2id, JWT + rotating refresh tokens |
| Data     | SQLite (dev, zero-setup) / PostgreSQL (production), Redis + BullMQ (optional, auto-fallback) |
| Ops      | Docker + nginx, GitHub Actions CI, OpenAPI docs at `/api/docs` |

## Quick start (development)

```bash
# 1. Backend (SQLite dev database, no external services needed)
cd backend
npm install
npx prisma db push        # create dev.db
npm run db:seed           # roles, permissions, categories, demo users
npm run start:dev         # http://localhost:3001/api/v1  (docs: /api/docs)

# 2. Frontend (separate terminal)
cd frontend
npm install
npm run dev               # http://localhost:5173 (proxies /api → :3001)
```

Demo users (password `Password123!`):

| Email | Role |
|---|---|
| admin@securedesk.local | ADMIN |
| agent@securedesk.local | IT_SUPPORT |
| manager@securedesk.local | MANAGER |
| employee@securedesk.local | EMPLOYEE |

## Verification

```bash
cd backend
npm run typecheck && npm test          # unit tests (SLA, state machines, RBAC model)
npm run build
npx tsx scripts/smoke.ts               # 37-check end-to-end API smoke test

cd ../frontend
npm run typecheck && npm test && npm run build
```

## What's implemented

**Backend** (the security boundary — `NEVER TRUST THE CLIENT`):

- **Auth**: register, login, refresh with **rotation + family reuse detection**, logout
  (session revocation), forgot/reset password, change password. Argon2id hashing,
  opaque refresh tokens stored **hashed**, httpOnly cookie scoped to `/api/v1/auth`.
- **Authorization**: global JWT + permission guards; RBAC with 26 fine-grained
  permissions across 4 seeded roles; **object-level authorization** on every ticket/asset
  access (employees cannot read others' tickets → 403); server-owned state machines for
  tickets (`OPEN → … → CLOSED`) and assets (`AVAILABLE → … → RETIRED`).
- **Tickets**: CRUD, assignment (IT_SUPPORT only), priority + SLA recalculation,
  comments with **internal notes hidden from requesters**, attachments (extension +
  size allow-list, randomized storage names), full history.
- **Assets**: register, assign, return, maintenance start/end, retire, history.
- **SLA**: category-specific or default policy, priority multipliers, deadline
  computation, scheduled scan with idempotent warning/breach notifications.
- **Notifications**: in-app + email stub honoring per-user preferences.
- **Jobs**: BullMQ when `REDIS_URL` is set; otherwise in-process queue with retries
  and an SLA scan timer (same business logic).
- **Audit & security events**: login/failures, token reuse, role changes, ticket/asset
  actions, admin actions — queryable via `/api/v1/audit` and `/api/v1/security`.
- **Reports**: ticket volume, resolution percentiles, SLA performance, asset inventory.
- **Platform**: Zod-validated env, request IDs, structured Pino logs, centralized error
  envelope (`{ success, error: { code, message, requestId } }`), rate-limit-ready,
  OpenAPI/Swagger, health/live/ready endpoints.

**Frontend** (permission-aware UX, never the security boundary):

- Login with session restoration; access token memory-only, silent single-flight
  refresh (no infinite loops), httpOnly refresh cookie.
- Role-aware navigation + permission guards on routes; every mutating action is also
  enforced server-side.
- Dashboard, tickets (list/create/detail with comments, status, assignment, attachments,
  history), assets (inventory/detail with lifecycle actions), notifications, reports
  (charts), profile (change password), admin (users with role/deactivation controls,
  roles & permissions editor, audit + security event viewer).

## Production deployment (Docker)

```bash
cp .env.example .env   # set POSTGRES_PASSWORD, JWT secrets, DATABASE_URL
docker compose up --build
```

- `frontend` (nginx :80) serves the SPA and reverse-proxies `/api` to the backend.
- `backend` runs Prisma migrations on boot (`prisma db push`) and connects to Postgres/Redis.
- For PostgreSQL, switch the Prisma datasource `provider` in `backend/prisma/schema.prisma`
  from `"sqlite"` to `"postgresql"` (schema is written to be compatible with both).

## API overview

Base path `/api/v1` — interactive docs at `/api/docs` when the backend runs.

```
POST /auth/register /auth/login /auth/refresh /auth/logout /auth/forgot-password
POST /auth/reset-password /auth/change-password      GET /auth/me
GET/POST /tickets          GET/PATCH/DELETE /tickets/:id
POST /tickets/:id/assign   PATCH /tickets/:id/status  PATCH /tickets/:id/priority
POST/GET /tickets/:id/comments   POST/GET /tickets/:id/attachments
GET/POST /assets           GET/PATCH /assets/:id
POST /assets/:id/assign|return|maintenance|maintenance/end|retire
GET /categories            POST/PATCH /categories (admin)
GET /notifications         POST /notifications/mark-read|mark-all-read
GET/PATCH /notifications/preferences
GET /reports/tickets|resolution-times|sla|assets
GET/POST /users            PATCH /users/:id          GET /roles  PATCH /roles/:id
GET /audit                 GET /security
GET /health /health/live /health/ready
```

## Environment variables

See `backend/.env.example`, `frontend/.env.example`, and root `.env.example`.
Secrets are never hard-coded; production boot refuses `change-me` JWT secrets.

## Repository layout

```
backend/
  prisma/schema.prisma        # all entities (users, roles, tickets, assets, SLA, audit…)
  prisma/seed.ts              # roles, permissions, categories, SLA, demo users
  src/app/                    # AppModule, health, API prefix
  src/config/                 # Zod-validated environment
  src/common/                 # guards (JWT + permissions), pipes, filters, middleware
  src/modules/                # auth, tickets, assets, users, categories, notifications, audit
  src/sla/                    # SLA engine + admin API
  src/jobs/                   # queue abstraction (BullMQ | inline), workers
  src/audit/ src/security/    # audit log + security event services
  scripts/smoke.ts            # end-to-end HTTP smoke test
frontend/
  src/api/                    # typed axios client (refresh queue), per-domain APIs
  src/app/                    # router, providers, guards
  src/features/auth/          # auth context (permission-aware UX)
  src/pages/                  # Login, Dashboard, Tickets, Assets, Notifications, Reports, Profile, Admin
docker/                       # Dockerfiles + nginx.conf
.github/workflows/ci.yml      # typecheck → tests → build → docker build
```
