# SecureDesk Backend — Setup Guide

Status check performed on this machine (Sep 2026):

| Component | Status | Action needed |
|---|---|---|
| Node.js 22 + npm | ✅ Installed | None |
| PostgreSQL server | ⚠️ Running, but **not wired up** — backend uses SQLite (`dev.db`) | Create DB/user, switch Prisma provider |
| Redis | ❌ Not installed | Install and set `REDIS_URL` |

> Note: PostgreSQL and Redis are **not required** for quick local dev — the app runs on
> SQLite with an in-process queue out of the box. Follow this guide when you want
> production-like infrastructure locally.

---

## 1. PostgreSQL

PostgreSQL is installed and running (`pg_isready` → accepting connections on `127.0.0.1:5432`).
What's missing: an app database/user, and pointing Prisma at it.

### 1.1 Create the database and user

```bash
sudo -u postgres psql <<'SQL'
CREATE USER securedesk WITH PASSWORD 'change-me-strong-password';
CREATE DATABASE securedesk OWNER securedesk;
GRANT ALL PRIVILEGES ON DATABASE securedesk TO securedesk;
SQL
```

Verify:

```bash
PGPASSWORD=change-me-strong-password psql -h 127.0.0.1 -U securedesk -d securedesk -c "SELECT 1;"
```

### 1.2 Point Prisma at PostgreSQL

Edit `backend/prisma/schema.prisma` and switch the datasource provider:

```prisma
datasource db {
  provider = "postgresql"   // was "sqlite"
  url      = env("DATABASE_URL")
}
```

### 1.3 Update `backend/.env`

```env
DATABASE_URL="postgresql://securedesk:change-me-strong-password@localhost:5432/securedesk"
```

(Use the same password you set in step 1.1. Pick a strong one for anything shared.)

### 1.4 Push the schema and seed

```bash
cd backend
npm run db:push     # creates all tables in the new Postgres DB
npm run db:seed     # roles, permissions, categories, demo users
```

> Tip: the old `backend/prisma/dev.db` (SQLite) becomes unused once switched. Keep it as
> backup or delete it. If you have data in SQLite you must keep, export it first —
> Prisma's `db push` does not migrate data across providers.

### 1.5 Verify

```bash
npm run db:studio   # Prisma Studio opens against Postgres
# or
PGPASSWORD=... psql -h 127.0.0.1 -U securedesk -d securedesk -c "\dt"
```

---

## 2. Redis (optional but recommended)

Redis enables the BullMQ-backed job queue. Without it, the backend logs
`queue.mode = inline` and runs jobs in-process with retries — fine for dev, but jobs
are lost on restart and SLA scans are per-process.

### 2.1 Install

```bash
sudo apt update
sudo apt install -y redis-server
```

### 2.2 Enable and start

```bash
sudo systemctl enable --now redis-server
sudo systemctl status redis-server
```

### 2.3 Verify

```bash
redis-cli ping      # → PONG
```

### 2.4 Enable in the backend

Uncomment / add in `backend/.env`:

```env
REDIS_URL=redis://localhost:6379
```

Then restart the dev server. On startup the log should show:

```
{"event":"queue.mode","mode":"bullmq"}
```

If the log says `inline` or `inline (fallback)`, Redis isn't reachable or `REDIS_URL`
is still empty.

---

## 3. JWT secrets (one-time)

If `backend/.env` still has placeholder secrets, generate real ones:

```bash
openssl rand -hex 32   # → JWT_ACCESS_SECRET
openssl rand -hex 32   # → JWT_REFRESH_SECRET (must differ)
```

The app refuses to boot in production with a `change-me` secret.

---

## 4. Run and verify everything

```bash
cd backend
npm install          # also runs `prisma generate`
npm run start:dev
```

Checklist:

- [ ] `GET http://localhost:3001/api/v1/health` → `{"status":"ok"}`
- [ ] Startup log shows `queue.mode = bullmq` (only if Redis is configured)
- [ ] Full API smoke test (spawns server itself):

```bash
npm run build
npx tsx scripts/smoke.ts
```

---

## 5. Docker alternative (production-style)

Skip native installs entirely by using the bundled `docker-compose.yml`:

```bash
cp .env.example .env        # set POSTGRES_PASSWORD, JWT secrets
docker compose up -d --build
```

This starts Postgres 16, Redis 7, the backend, and the frontend (nginx on port 80).
`REDIS_URL` and the Postgres `DATABASE_URL` are pre-wired inside compose.
The docker path also expects the Prisma provider switched to `postgresql` (see 1.2).

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `P1001: can't reach database` | Postgres not running: `sudo systemctl start postgresql`; check host/port in `DATABASE_URL` |
| `P1003` / auth failure on Postgres | Password mismatch between step 1.1 and `backend/.env`; re-set with `ALTER USER securedesk WITH PASSWORD '...'` |
| Seed fails with unique-constraint errors | DB already seeded — run `npm run db:push` then re-seed only after resetting |
| Log shows `queue.mode = inline (fallback)` | `bullmq` failed to connect — check `redis-cli ping` and `REDIS_URL` |
| `Refusing to run in production with a development JWT secret` | Set real `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` (section 3) |
