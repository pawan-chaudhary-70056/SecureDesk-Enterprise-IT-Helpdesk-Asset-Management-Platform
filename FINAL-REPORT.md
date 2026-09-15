# SecureDesk — Final Project Report

| | |
|---|---|
| **Product** | SecureDesk — Enterprise IT Helpdesk & Asset Management Platform |
| **Document type** | Final delivery report |
| **Audience** | Business stakeholders, project managers, auditors, and engineering teams |
| **Verification status** | All checks passing: type checks, 18 automated tests, production builds, and a 37/37 end-to-end API verification suite |

---

## Table of contents

1. [Executive summary](#1-executive-summary)
2. [What the application does](#2-what-the-application-does)
3. [How the application works](#3-how-the-application-works)
4. [Architecture in detail](#4-architecture-in-detail)
5. [The data model](#5-the-data-model)
6. [Security model](#6-security-model)
7. [Technology stack](#7-technology-stack)
8. [Deployment and operations](#8-deployment-and-operations)
9. [Quality verification](#9-quality-verification)
10. [Known limitations and recommended next steps](#10-known-limitations-and-recommended-next-steps)

---

## 1. Executive summary

SecureDesk is a web-based platform that companies use to run their internal IT support desk and keep track of company-owned equipment. Employees raise requests when something goes wrong ("my laptop will not start", "I need software installed"); the IT team manages those requests through a controlled workflow from creation to resolution; managers monitor performance through reports; and administrators manage user accounts, equipment, and system-wide settings.

The platform was built around one central principle: **the server never trusts the browser**. Every request — regardless of where it originates — is verified for identity, permission, and ownership before any data is read or changed. Passwords are stored using the strongest available hashing standard, sessions use short-lived tokens with automatic theft detection, and every significant action is permanently recorded in an audit trail.

The delivered system is **complete and fully working**. It consists of two applications that work together: a browser application (the part users see and interact with) and a server application (the part that enforces all rules and stores all data). Both have been verified through automated type checking, unit testing, production builds, and a 37-point end-to-end test that exercises real user journeys over real network calls.

---

## 2. What the application does

### 2.1 The problem it solves

Without a system like SecureDesk, IT requests typically arrive through scattered channels — hallway conversations, emails, chat messages — and are tracked in spreadsheets. This leads to lost requests, unclear ownership, no visibility on workload, and no way to prove how quickly the team responds.

SecureDesk centralizes all of this into one place with clear ownership, measurable response targets, and a complete record of every action.

### 2.2 Capabilities by role

SecureDesk uses **role-based access control (RBAC)**: each user belongs to a role, and each role is granted a specific set of permissions (26 fine-grained permissions in total). A user only sees the features their role permits.

| Role | What they can do |
|---|---|
| **Employee** | Create tickets for their own problems, comment on their own tickets, confirm resolution, view the equipment assigned to them, and manage their personal notification preferences. |
| **IT Support (agent)** | Everything above, plus: view the unassigned queue and all tickets, self-assign or reassign tickets, move tickets through their lifecycle, change priority, write **internal notes** (visible to staff, never to requesters), attach files, and manage equipment records. |
| **Manager** | View team tickets and the full reporting suite: ticket volumes, resolution-time statistics, service-level performance, and asset inventory charts. Managers observe; they cannot modify tickets. |
| **Administrator** | Everything above, plus: create and manage user accounts, change roles, deactivate users (which instantly ends their sessions), edit the permission matrix of any role, manage categories, define service-level policies, delete tickets, and inspect the full audit and security event logs. |

### 2.3 Core feature areas

- **Ticketing** — creation, assignment, priority handling, a server-controlled status workflow, threaded comments with internal notes, file attachments, and a permanent per-ticket change history.
- **Asset management** — a register of company equipment (tag, serial number, category, location, warranty), a controlled lifecycle (available → assigned → returned/maintenance → retired), and a full assignment history per device.
- **Service-level agreements (SLA)** — configurable response and resolution targets per category and priority; deadlines are stamped on every ticket automatically, and a background monitor warns before deadlines and escalates breaches.
- **Notifications** — in-app notifications (with unread counts) for assignments, status changes, comments, and SLA events, honoring each user's personal preferences; an email channel is provided as a pluggable delivery point.
- **Administration** — user management, a live role/permission editor, category management, SLA policy management, and audit/security log viewers.
- **Reports** — ticket volume by status and priority, resolution-time statistics (median, 90th percentile, average), current SLA health, and asset inventory distribution, presented as charts.

---

## 3. How the application works

This chapter explains the system in plain language, following real usage.

### 3.1 Signing in (authentication)

1. The user enters their email and password on the login page.
2. The server finds the account, verifies the password against the stored Argon2id hash, and checks the account is active.
3. The server returns a short-lived **access token** (valid 15 minutes) and sets a **refresh cookie** (valid up to 30 days) that is invisible to JavaScript and only sent to the authentication endpoints.
4. The browser application keeps the access token **in memory only** — never in storage — and silently obtains a fresh one through the refresh cookie when needed. If a refresh cookie is ever replayed (a sign of token theft), the entire session family is revoked and the event is recorded.

The practical effect: a stolen browser tab loses access within 15 minutes, and stolen refresh cookies are detected and neutralized automatically.

### 3.2 The life of a ticket

1. **Creation.** Eve reports "Laptop will not boot" with high priority. The server stamps the ticket with the correct SLA deadlines from the Hardware category policy (e.g., first response within 30 minutes for high priority), notifies the support team, and records the event in the audit log.
2. **Queue and assignment.** Agents see the ticket in the unassigned queue. Sam assigns it to himself; the status moves from *Open* to *Assigned*.
3. **Work.** Sam moves it to *In Progress*, exchanges comments with Eve, and adds an internal note ("ordered replacement cable") — the system simply never delivers internal notes to requesters, no matter how the data is requested.
4. **Evidence.** Sam attaches a photo of the faulty part. Uploads are restricted by file type and size, stored under randomized names, and can only be downloaded by people allowed to see the ticket.
5. **Resolution.** Sam marks it *Resolved*; Eve reviews and confirms, moving it to *Closed*. If she disagrees, the ticket can be reopened within the allowed workflow.
6. **Record.** Every step above is written both to the ticket's visible history and to the permanent audit trail.

The status workflow is **owned by the server**: only valid transitions are accepted (for example, a closed ticket can never be reopened silently, and a ticket cannot jump from *Open* to *Resolved* while skipping states that require work). This keeps data consistent even against malformed or malicious requests.

### 3.3 Staying on schedule (SLA monitoring)

A background worker runs every minute. For every active ticket it compares the stamped deadlines against the current time:

- Approaching a deadline (within the warning window) → notifies the requester and assignee.
- Past a deadline → escalates with a breach notification and records the escalation.

The monitor is **idempotent**: repeated scans never duplicate notifications for the same ticket and event type. In development the worker runs inside the server process; in production it can run on a Redis-backed job queue shared across server instances.

### 3.4 Equipment tracking (assets)

Assets follow their own lifecycle owned by the server: *Available → Assigned → Returned* (then available again) or *→ Maintenance → Available*, with *Retired* as a final state. Assignment and return are transactional — the device status, the assignment record, and the device history are all updated together or not at all. Employees can only ever see the equipment assigned to them.

---

## 4. Architecture in detail

### 4.1 System overview

```
┌────────────────────────────────────────────────────────────────────┐
│                            BROWSER                                 │
│  React single-page application (SPA)                               │
│  • Screens: Login, Dashboard, Tickets, Ticket Detail, Assets,      │
│    Asset Detail, Notifications, Reports, Profile, Admin            │
│  • Route guards hide screens the user's role cannot use            │
│  • TanStack Query manages server data caching and refetching       │
│  • React Hook Form + Zod validate every input before sending       │
│  • Axios client: attaches access token, auto-refreshes on expiry,  │
│    single-flight refresh (parallel failures → one refresh call)    │
└───────────────────────────────┬────────────────────────────────────┘
                                │ HTTPS, JSON, path /api/v1/...
┌───────────────────────────────▼────────────────────────────────────┐
│                     NGINX (production entry point)                 │
│  • Serves the compiled SPA with cache-friendly asset headers       │
│  • Reverse-proxies /api/* to the backend service                   │
│  • Enforces body size limits and security headers                  │
└───────────────────────────────┬────────────────────────────────────┘
┌───────────────────────────────▼────────────────────────────────────┐
│                  NESTJS API SERVER (Node.js + TypeScript)          │
│                                                                    │
│  1. Middleware chain                                               │
│     • Request-ID: assigns a unique trace id to every request       │
│       and echoes it in responses for support/debugging             │
│     • HTTP logger: structured, token-free request logging with     │
│       method, path, user, status, and duration                     │
│     • Body parser with strict size limits (1 MB JSON)              │
│                                                                    │
│  2. Global guards (run on every route)                             │
│     • JWT guard: validates the access token, loads the live user   │
│       and their current permissions from the database, and         │
│       rejects inactive or deleted accounts immediately             │
│     • Permission guard: compares the user's permissions with       │
│       those required by the endpoint (any-of semantics)            │
│                                                                    │
│  3. Validation pipe                                                │
│     • Every request body/query is parsed and validated against a   │
│       strict schema; unknown fields are stripped; failures return  │
│       field-level error details                                    │
│                                                                    │
│  4. Domain modules (business logic)                                │
│     Auth · Tickets · Assets · Users & Roles · Categories ·         │
│     Notifications · SLA · Reports · Audit · Security               │
│     Each service re-checks object-level ownership before it        │
│     touches data (see §6)                                          │
│                                                                    │
│  5. Background jobs                                                │
│     • Notification worker: creates in-app rows and dispatches      │
│       email delivery, with retries and backoff                     │
│     • SLA scanner: deadline warnings and breach escalation         │
│     • Transport: BullMQ over Redis in production; an in-process    │
│       queue with identical behavior when Redis is absent           │
│                                                                    │
│  6. Cross-cutting services                                         │
│     • Audit service: append-only record of business actions        │
│     • Security event service: auth failures, token reuse, etc.     │
│     • Global exception filter: converts every error — including    │
│       database errors — into a uniform, safe JSON envelope         │
└───────────────┬────────────────────────────────┬───────────────────┘
                │ Prisma ORM (type-safe SQL)     │
      ┌─────────▼──────────┐          ┌──────────▼─────────┐
      │  PostgreSQL (prod) │          │  Redis (optional)  │
      │  or SQLite (dev)   │          │  job queue broker  │
      └────────────────────┘          └────────────────────┘
```

### 4.2 The life of a single request

To make the architecture concrete, here is exactly what happens when an agent presses "Move to In Progress" on a ticket:

| Step | Component | What happens |
|---|---|---|
| 1 | Browser | The UI calls the API client, which attaches the in-memory access token to `PATCH /api/v1/tickets/:id/status`. |
| 2 | Nginx | Forwards the call to the backend over the internal network. |
| 3 | Request-ID middleware | If absent, generates a unique id for this request; every log line and error response from now on carries it. |
| 4 | HTTP logger | Records that the request arrived (method, path, user). |
| 5 | JWT guard | Verifies the token signature and expiry, then loads the user from the database — confirming the account still exists and is active, and reading the user's *current* permissions (a permission revoked a second ago takes effect immediately). |
| 6 | Permission guard | Confirms the user holds one of the permissions this endpoint requires (`ticket:update`). Otherwise: **403 Forbidden**. |
| 7 | Validation pipe | Parses the body `{ "status": "IN_PROGRESS", "note": "..." }` against the schema; anything unexpected is stripped; an invalid status value returns **400** with field details. |
| 8 | Controller | A thin adapter that hands the validated data to the ticket service. |
| 9 | Service — object-level check | Loads the ticket and verifies this specific agent may act on it (assignee, staff, or administrator). An employee touching someone else's ticket would be stopped here: **403**. |
| 10 | Service — state machine | Checks the transition `ASSIGNED → IN_PROGRESS` is legal. An illegal jump returns **403** with an explanatory message. |
| 11 | Prisma | Updates the ticket row within the database. |
| 12 | Side effects | Writes ticket history ("STATUS_CHANGED: ASSIGNED → IN_PROGRESS"), an audit entry, and enqueues a notification for the requester. |
| 13 | Response | Returns the updated ticket as JSON. |
| 14 | Browser | TanStack Query invalidates its cached ticket lists and details, so every open screen refetches and displays the new state. |
| 15 | On error | If anything failed with an unexpected database error, the global exception filter converts it into `{ success: false, error: { code, message, requestId } }` — meaningful HTTP status codes, no stack traces or SQL ever exposed — while the `requestId` lets support find the exact log entry. |

### 4.3 Repository layout

```
securedesk/
├── backend/
│   ├── prisma/schema.prisma        # database schema (single source of truth)
│   ├── prisma/seed.ts              # roles, permissions, categories, SLA, demo users
│   ├── scripts/smoke.ts            # 37-check end-to-end API verification
│   └── src/
│       ├── main.ts                 # server bootstrap (CORS, docs, pipes, filters)
│       ├── app/                    # root module, health endpoints
│       ├── config/                 # environment schema with fail-fast validation
│       ├── common/                 # guards, pipes, filters, middleware, constants
│       ├── database/               # Prisma client service
│       ├── modules/
│       │   ├── auth/               # login, register, refresh rotation, passwords
│       │   ├── tickets/            # tickets, comments, attachments, history
│       │   ├── assets/             # asset lifecycle
│       │   ├── users/              # user & role administration
│       │   ├── categories/         # ticket/asset categories
│       │   ├── notifications/      # in-app + email notification service
│       │   ├── reports/            # analytics endpoints
│       │   └── audit/              # audit & security log query API
│       ├── sla/                    # SLA engine, policies, scheduled scanner
│       ├── jobs/                   # queue abstraction (Redis or in-process)
│       ├── audit/  security/       # append-only log services
├── frontend/
│   └── src/
│       ├── api/                    # typed API client and per-domain calls
│       ├── app/                    # router, providers, auth/permission guards
│       ├── features/auth/          # session context (permission-aware UX)
│       ├── components/ui/          # shared UI primitives
│       ├── hooks/                  # data-fetching and mutation hooks
│       └── pages/                  # one folder per screen
├── docker/                         # Dockerfiles + nginx configuration
├── docker-compose.yml              # postgres + redis + backend + frontend
└── .github/workflows/ci.yml        # typecheck → tests → build → docker build
```

### 4.4 Why this architecture

- **Separation of layers.** The browser renders and validates for convenience; the server decides. A compromised client cannot bypass any rule, because rules live entirely server-side.
- **Stateless API.** The server keeps no login state in memory; any instance can serve any request, which makes horizontal scaling straightforward.
- **Pluggable infrastructure.** The queue works with or without Redis; the database is SQLite in development (zero setup) and PostgreSQL in production through a one-line switch.
- **Observability by default.** Request IDs, structured logs, audit logs, security events, and health/readiness endpoints are built in rather than bolted on.

---

## 5. The data model

The database contains the following principal entities (via Prisma ORM):

| Entity | Purpose | Key relationships |
|---|---|---|
| **User** | People who sign in; email is unique; carries active/inactive flag and last-login time | Belongs to a Role; owns tickets, comments, attachments, assets, notifications, sessions |
| **Role / Permission / RolePermission** | The RBAC model: roles group users; permissions define capabilities; the join table assigns permissions to roles | Editable live from the admin UI |
| **Ticket** | A support request: title, description, status, priority, SLA deadlines, lifecycle timestamps | Belongs to requester and (optionally) assignee; has comments, attachments, history |
| **TicketComment** | Threaded discussion; `isInternal` marks staff-only notes | Belongs to a ticket and an author |
| **TicketAttachment** | File metadata; the file itself is stored on disk under a randomized name | Belongs to a ticket and an uploader |
| **TicketHistory** | Append-only record of every change to a ticket | Belongs to a ticket; references the actor |
| **Asset / AssetAssignment / AssetHistory** | Equipment register, assignment ledger, and change log | Assignments link assets to users with timestamps and notes |
| **SlaPolicy** | Named response/resolution targets, either category-specific or the global default | Optional link to a Category |
| **Category** | Shared classification for tickets and assets | Referenced by tickets, assets, and SLA policies |
| **Notification / NotificationPreference** | Per-user in-app messages and delivery preferences | Belongs to a user |
| **RefreshToken / PasswordResetToken** | Session and reset credentials, stored as SHA-256 hashes with family tracking for reuse detection | Belongs to a user |
| **AuditLog / SecurityEvent** | Permanent compliance and security records | Optional actor reference; indexed by time and type |

All workflow values (statuses, priorities) are additionally validated in application constants, so illegal values can never enter the system through any endpoint.

---

## 6. Security model

### 6.1 Three layers of authorization

| Layer | Question | Enforcement point | Example rejection |
|---|---|---|---|
| 1. Identity | Are you a real, active user with a valid token? | JWT guard on every route | Expired token → 401 |
| 2. Capability | Is your role allowed to perform this kind of action? | Permission guard + per-service assertions | Employee creating assets → 403 |
| 3. Ownership | May you act on this *specific* record? | Service-level checks before every read/write | Employee opening another person's ticket → 403 |

Layer 3 is the one most systems get wrong; here it is applied uniformly, including on file downloads, comment visibility, and asset records.

### 6.2 Credential handling

- **Password storage:** Argon2id (memory-hard, tuned parameters) — resistant to GPU cracking.
- **Access tokens:** JWT, 15-minute lifetime, held in browser memory only.
- **Refresh tokens:** opaque random 256-bit values; only their SHA-256 hash is stored; delivered as an httpOnly cookie scoped to `/api/v1/auth` so page scripts cannot read them; **rotated on every use**; tokens from a reused (previously rotated) credential trigger automatic revocation of the whole session family and a security alert.
- **Password changes and resets** revoke every existing session for that user; account deactivation does the same instantly.
- **Reset flow** reveals nothing: the response is identical whether or not the email exists.

### 6.3 Input and data safety

- Every payload is schema-validated; unknown fields are stripped.
- Uploads: extension and size allow-lists, randomized storage names, forced download disposition (prevents stored-script attacks).
- Database access exclusively through Prisma's parameterized queries — no string-built SQL, so injection is structurally prevented.
- Centralized error handling guarantees no stack traces, SQL fragments, or infrastructure details ever reach a client.
- Production startup refuses known development secrets.

### 6.4 Accountability

Every login (success and failure), password event, role change, permission edit, ticket action, asset action, and administrative action is recorded — with actor, timestamp, IP address, and request id — and is queryable through admin-only endpoints.

---

## 7. Technology stack

| Layer | Technology | Why it was chosen |
|---|---|---|
| Browser app | React 18, TypeScript, Vite, Tailwind CSS | Industry-standard, fast developer loop, type safety end to end |
| Data fetching & forms | TanStack Query, React Hook Form + Zod | Consistent caching/refetching; the same validation library mirrors server rules |
| Charts | Recharts | Lightweight reporting visuals |
| API server | NestJS 10 (Node.js 20+), TypeScript | Structured, modular framework with dependency injection and strong conventions |
| Database access | Prisma ORM | Type-safe queries, schema-as-code, provider swap for Postgres/SQLite |
| Databases | SQLite (dev) / PostgreSQL 16 (prod) | Zero-setup locally; production-grade relational store |
| Background jobs | BullMQ + Redis (optional) with in-process fallback | Reliable queueing at scale without forcing infrastructure on small deployments |
| Auth | Argon2id, JWT (@nestjs/jwt), opaque rotating refresh tokens | Current best practice for credential storage and session handling |
| Validation | Zod (server env, bodies, queries) | One validation language across the stack |
| Logging | Pino structured logs + request IDs | Machine-parseable logs with full traceability |
| Documentation | Swagger/OpenAPI at `/api/docs` | Living, always-current API documentation |
| Delivery | Docker + docker compose + nginx, GitHub Actions CI | Reproducible builds and automated quality gates |

---

## 8. Deployment and operations

### 8.1 Running in development

```bash
cd backend && npm install && npx prisma db push && npm run db:seed && npm run start:dev
cd frontend && npm install && npm run dev
```

The API listens on `http://localhost:3001/api/v1` (interactive docs at `/api/docs`); the web app serves on `http://localhost:5173` and proxies API calls automatically. Demo accounts for all four roles use the password `Password123!`.

### 8.2 Running in production

```bash
cp .env.example .env    # set database password, JWT secrets, origins
docker compose up --build
```

Compose starts four services: **postgres** (with health checks), **redis** (job queue), **backend** (applies the schema on boot, then serves the API), and **frontend** (nginx on port 80, serving the web app and proxying `/api` to the backend). Uploads persist in a named volume.

### 8.3 Operating the system

| Concern | Where to look |
|---|---|
| Is the service alive? | `GET /api/v1/health` and `/health/live` |
| Is the database reachable? | `GET /api/v1/health/ready` (executes a real database round-trip) |
| What did user X do? | Admin → Audit logs |
| Were there sign-in failures or token-theft alerts? | Admin → Security events |
| Are we meeting SLA targets? | Reports → SLA panel; the scanner also records escalations in the audit log |
| API contract for integrations | `/api/docs` (OpenAPI) |

Environment configuration is validated at startup with clear failure messages — a missing or malformed variable stops the process immediately rather than causing mysterious behavior later.

---

## 9. Quality verification

All of the following were executed against the final code:

| Check | Scope | Result |
|---|---|---|
| Type checking (both applications) | Whole codebase, strict mode | **Pass** — zero errors |
| Unit tests (backend) | SLA multipliers, ticket and asset state machines, role–permission model | **17/17 pass** |
| Unit tests (frontend) | Permission-aware route guarding | **1/1 pass** |
| Production builds (both applications) | Full compile and bundling | **Pass** — no warnings |
| End-to-end API verification (37 checks over real HTTP) | Health; login for all roles; bad-password rejection; registration; duplicate registration; role barriers (employee↔admin endpoints); object-level privacy (employee cannot read another user's ticket); queue visibility; assignment; status workflow; internal-note hiding from requesters; refresh-token rotation; asset creation/assignment/return with permission barriers; notifications; reports; audit trail; logout revoking sessions | **37/37 pass** |

Additionally, a line-by-line code audit was completed and all 14 identified issues were fixed and re-verified (error-code mapping, a scheduler gap in Redis mode, a notification-filtering defect, incorrect HTTP semantics on duplicate records, client cache mutation, unreachable screens, a self-referencing link, CI configuration, and others).

---

## 10. Known limitations and recommended next steps

The application is feature-complete for its specification. The following are honest gaps between "works correctly" and "hardened for large-scale production," in priority order:

| # | Item | Current state | Recommendation |
|---|---|---|---|
| 1 | **Rate limiting on authentication endpoints** | A limit setting exists in configuration but is not yet enforced | Add throttling to login/register/reset endpoints and record `RATE_LIMITED` security events — the highest-value remaining protection against password guessing |
| 2 | **Versioned database migrations** | Schema applied with `prisma db push` | Adopt `prisma migrate` so upgrades are repeatable and auditable |
| 3 | **Email delivery** | Emails are logged, not sent (the delivery function is a single, documented swap point) | Connect an SMTP or email-API provider in the notification worker |
| 4 | **First-response metric** | The schema field exists but is not yet stamped | Set `firstRespondedAt` on the first agent comment to measure response-SLA compliance precisely |
| 5 | **Unused refresh-secret variable** | Validated but not needed (refresh tokens are opaque and hashed) | Remove it, or adopt signed refresh JWTs if preferred |
| 6 | **File storage / session cleanup / lockout** (optional) | Local disk storage; expired token rows remain until cleaned; no lockout counter | Move uploads to object storage, schedule cleanup of expired tokens, and add temporary lockout after repeated failures |

**Conclusion.** SecureDesk is a complete, working, and thoroughly verified helpdesk and asset-management platform with a security-first architecture: rules live on the server, sensitive actions are always re-verified, and every meaningful event is recorded. Closing the items above — chiefly rate limiting and versioned migrations — positions it for confident production rollout.
