# SecureDesk — Enterprise IT Helpdesk & Asset Management Platform

Production-oriented full-stack architecture for an enterprise IT helpdesk and asset management system.

## Technology

- **Language:** TypeScript
- **Frontend:** React + Vite
- **Backend:** Node.js + NestJS
- **Database:** PostgreSQL + Prisma
- **Cache/Queue:** Redis + BullMQ
- **API:** REST + OpenAPI
- **Authentication:** JWT + refresh-token/session design + Argon2id
- **Testing:** Vitest + React Testing Library + Supertest + Playwright
- **Deployment:** Docker + Nginx + GitHub Actions

## Documents

- `SECUREDESK-FRONTEND.md` — frontend architecture, security model, flows, folder structure and AI build prompts.
- `SECUREDESK-BACKEND.md` — backend architecture, authorization model, database, security, jobs, testing and AI build prompts.

## Overall Architecture

```text
                         USERS
                           |
                           v
              +-------------------------+
              | React + TypeScript      |
              | Frontend                |
              +------------+------------+
                           |
                         HTTPS
                           |
                           v
                      +---------+
                      |  NGINX  |
                      +----+----+
                           |
                           v
              +-------------------------+
              | NestJS + TypeScript    |
              | Backend API             |
              +------------+------------+
                           |
             +-------------+-------------+
             |             |             |
             v             v             v
        PostgreSQL      Redis        BullMQ
             |                           |
             v                           v
       Business Data               Workers
                                     |
                         +-----------+----------+
                         |           |          |
                    Notifications   SLA      Reports
```

## Core Users

```text
EMPLOYEE
IT_SUPPORT
MANAGER
ADMIN
```

## Core Modules

```text
Authentication
Users
Roles
Permissions
Tickets
Comments
Attachments
Assets
Categories
SLA
Notifications
Reports
Audit
Security
```

## Development Strategy

Build in small, verifiable phases:

```text
1. Repository + project foundation
2. Frontend foundation
3. Backend foundation
4. Database
5. Authentication
6. Authorization
7. Ticket module
8. Asset module
9. SLA
10. Notifications + background jobs
11. Audit + security events
12. Reports
13. OpenAPI
14. Testing
15. Docker
16. CI/CD
17. Production hardening
```

## AI Coding Strategy

Do **not** give an AI the entire project and ask for all code at once.

Use the implementation prompts in the frontend and backend documents one phase at a time.

For every phase:

```text
Specification
   |
   v
AI implementation
   |
   v
Run application
   |
   v
Run tests
   |
   v
Review generated code
   |
   v
Fix issues
   |
   v
Commit to Git
   |
   v
Next phase
```

### Recommended AI prompt pattern

For every implementation request, tell the AI:

```text
1. Read the relevant SecureDesk specification.
2. Implement only the requested phase.
3. Do not rewrite unrelated modules.
4. Follow the existing architecture.
5. Keep TypeScript strict.
6. Do not hard-code secrets.
7. Enforce backend authorization server-side.
8. Add/update tests for the feature.
9. Explain changed files briefly.
10. Stop after completing the requested phase.
```

## Security Rule

```text
Frontend restrictions are NOT security controls.

Backend authorization is the security boundary.

NEVER TRUST THE CLIENT.
```

## Expected Result

The completed system should provide:

- Secure authentication
- Server-side RBAC
- Object-level authorization
- Enterprise ticket management
- IT asset management
- SLA tracking and escalation
- Notifications
- Audit trails
- Security events
- Reporting
- Background processing
- API documentation
- Automated tests
- Docker deployment
- CI/CD
- Production-oriented security controls
