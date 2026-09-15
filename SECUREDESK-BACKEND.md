# SecureDesk — Enterprise IT Helpdesk & Asset Management Platform
## Backend Architecture & Development Specification

**Document Type:** Production-Oriented Backend Architecture  
**Version:** 1.0  
**Primary Language:** TypeScript  
**Runtime:** Node.js  
**Framework:** NestJS  
**Database:** PostgreSQL  
**Purpose:** Human- and AI-readable implementation blueprint

---

## 1. Project Overview

SecureDesk is an enterprise IT Helpdesk and Asset Management Platform.

The backend is the authoritative security and business-logic layer.

It provides:

- Authentication
- Authorization
- Role-based access control
- Object-level authorization
- Ticket management
- Comments
- Attachments
- Asset management
- SLA management
- Notifications
- Reports
- Audit logs
- Security events
- Sessions
- Background jobs
- API documentation
- Health checks

---

## 2. Backend Technology Stack

| Area | Technology |
|---|---|
| Language | TypeScript |
| Runtime | Node.js |
| Framework | NestJS |
| API | REST |
| Database | PostgreSQL |
| ORM | Prisma |
| Cache | Redis |
| Queue | BullMQ |
| Authentication | JWT + Refresh Token |
| Password hashing | Argon2id |
| Validation | class-validator / Zod where appropriate |
| Logging | Pino |
| API documentation | OpenAPI / Swagger |
| Testing | Vitest + Supertest |
| Containerization | Docker |
| Reverse proxy | Nginx |
| CI/CD | GitHub Actions |

---

## 3. Complete Backend Architecture Flow

```text
                           INTERNET
                              |
                              | HTTPS
                              v
                    +--------------------+
                    |       NGINX        |
                    | Reverse Proxy/TLS  |
                    +---------+----------+
                              |
                              v
                    +--------------------+
                    |    NestJS API      |
                    +---------+----------+
                              |
                              v
                    +--------------------+
                    | Middleware /       |
                    | Request Context    |
                    +---------+----------+
                              |
                              v
                    +--------------------+
                    | Authentication     |
                    | JWT / Session      |
                    +---------+----------+
                              |
                     +--------+--------+
                     |                 |
                   FAIL               PASS
                     |                 |
                     v                 v
                  401/403       Authorization
                                      |
                                      v
                              RBAC + Permissions
                                      |
                                      v
                              Object Authorization
                                      |
                                      v
                              Request Validation
                                      |
                                      v
                              Controller Layer
                                      |
                                      v
                              Service Layer
                                      |
                     +----------------+----------------+
                     |                                 |
                     v                                 v
               Business Rules                    Audit/Event Logic
                     |                                 |
                     v                                 v
                Prisma ORM                       Audit Service
                     |                                 |
                     v                                 v
                PostgreSQL                      Security Events
                     |
                     |
              +------+------+
              |             |
              v             v
            Redis         BullMQ
            Cache          Queue
                            |
                            v
                    Background Workers
                    /        |         \
                   /         |          \
                  v          v           v
          Notifications    SLA       Reports
```

---

## 4. Backend Folder Structure

```text
backend/
|
├── src/
│   |
│   ├── main.ts
│   |
│   ├── app/
│   │   ├── app.module.ts
│   │   ├── routes.ts
│   │   └── health.module.ts
│   |
│   ├── config/
│   │   ├── configuration.ts
│   │   ├── environment.ts
│   │   ├── database.ts
│   │   ├── redis.ts
│   │   └── security.ts
│   |
│   ├── common/
│   │   ├── guards/
│   │   ├── decorators/
│   │   ├── filters/
│   │   ├── interceptors/
│   │   ├── pipes/
│   │   ├── middleware/
│   │   ├── exceptions/
│   │   └── types/
│   |
│   ├── modules/
│   │   ├── auth/
│   │   ├── users/
│   │   ├── roles/
│   │   ├── permissions/
│   │   ├── tickets/
│   │   ├── comments/
│   │   ├── attachments/
│   │   ├── assets/
│   │   ├── categories/
│   │   ├── sla/
│   │   ├── notifications/
│   │   ├── reports/
│   │   ├── audit/
│   │   └── security/
│   |
│   ├── database/
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   └── migrations/
│   │   └── seed/
│   |
│   ├── jobs/
│   │   ├── notification/
│   │   ├── sla/
│   │   └── reports/
│   |
│   └── docs/
│       └── openapi.yaml
|
├── test/
│   ├── unit/
│   ├── integration/
│   └── e2e/
|
├── Dockerfile
├── docker-compose.yml
├── package.json
├── tsconfig.json
└── README.md
```

---

## 5. Module Architecture

Every major business module should follow a consistent structure.

Example:

```text
tickets/
├── tickets.module.ts
├── tickets.controller.ts
├── tickets.service.ts
├── tickets.repository.ts
├── dto/
├── entities/
├── policies/
├── constants/
└── tests/
```

### Responsibility

**Controller**

Receives HTTP requests and returns HTTP responses.

**Service**

Contains business logic.

**Repository**

Contains persistence/data-access logic.

**DTO**

Defines and validates request/response contracts.

**Policy**

Contains authorization/business policy checks when complexity requires separation.

---

## 6. API Versioning

Base path:

```text
/api/v1
```

Main API groups:

```text
/api/v1/auth
/api/v1/users
/api/v1/roles
/api/v1/permissions
/api/v1/tickets
/api/v1/comments
/api/v1/attachments
/api/v1/assets
/api/v1/categories
/api/v1/sla
/api/v1/notifications
/api/v1/reports
/api/v1/admin
/api/v1/audit
/api/v1/security
```

---

## 7. Authentication API

```text
POST /api/v1/auth/register
POST /api/v1/auth/login
POST /api/v1/auth/refresh
POST /api/v1/auth/logout
POST /api/v1/auth/forgot-password
POST /api/v1/auth/reset-password
GET  /api/v1/auth/me
```

Authentication flow:

```text
Login Request
     |
     v
Validate input
     |
     v
Find user
     |
     v
Verify Argon2id password hash
     |
     +---- fail ----> generic authentication failure
     |
     v
Create authenticated session/tokens
     |
     v
Return safe authentication response
```

Never return:

- Password hash
- Internal security secrets
- Sensitive database fields

---

## 8. Authorization Model

SecureDesk uses:

```text
RBAC
+
Permission checks
+
Object-level authorization
```

Example:

```text
EMPLOYEE
  |
  +--> ticket:create
  +--> ticket:read:own
  +--> ticket:comment:own

IT_SUPPORT
  |
  +--> ticket:read:assigned
  +--> ticket:update
  +--> ticket:resolve
  +--> asset:manage

MANAGER
  |
  +--> ticket:read:team
  +--> report:read

ADMIN
  |
  +--> user:manage
  +--> role:manage
  +--> permission:manage
  +--> audit:read
  +--> security:manage
```

### Critical Rule

Role alone is not enough.

Example:

```text
Employee A
     |
     v
PATCH /tickets/999
     |
     v
Does ticket 999 belong to / is accessible by Employee A?
     |
   NO
     |
     v
403 Forbidden
```

---

## 9. Security Request Flow

Every protected request should conceptually follow:

```text
HTTP Request
     |
     v
TLS / NGINX
     |
     v
Request ID
     |
     v
Rate Limit
     |
     v
Authentication
     |
     +---- fail ---> 401
     |
     v
Role / Permission
     |
     +---- fail ---> 403
     |
     v
Object-Level Authorization
     |
     +---- fail ---> 403
     |
     v
DTO Validation
     |
     +---- fail ---> 400
     |
     v
Controller
     |
     v
Service
     |
     v
Database Transaction
     |
     v
Audit Event
     |
     v
Response
```

---

## 10. Ticket Business Flow

```text
Employee
   |
   v
Create Ticket
   |
   v
Validate Request
   |
   v
Authorize User
   |
   v
Create Ticket
   |
   v
Calculate SLA
   |
   v
Assign / Queue
   |
   v
Notify IT Support
   |
   v
IT Support Investigation
   |
   v
Status Updates
   |
   v
Resolution
   |
   v
Employee Confirmation
   |
   v
Closed
```

Ticket states:

```text
OPEN
ASSIGNED
IN_PROGRESS
PENDING
RESOLVED
CLOSED
```

The backend owns the valid state transitions.

---

## 11. Ticket API

```text
POST   /api/v1/tickets
GET    /api/v1/tickets
GET    /api/v1/tickets/:id
PATCH  /api/v1/tickets/:id
DELETE /api/v1/tickets/:id

POST   /api/v1/tickets/:id/assign
PATCH  /api/v1/tickets/:id/status
PATCH  /api/v1/tickets/:id/priority

POST   /api/v1/tickets/:id/comments
GET    /api/v1/tickets/:id/comments

POST   /api/v1/tickets/:id/attachments
```

---

## 12. Asset Business Flow

```text
ADMIN
  |
  v
Register Asset
  |
  v
AVAILABLE
  |
  v
Assign
  |
  v
ASSIGNED
  |
  +------> MAINTENANCE
  |            |
  |            v
  |        AVAILABLE
  |
  v
RETURNED
  |
  v
AVAILABLE
  |
  v
RETIRED
```

Asset operations must verify authorization and current asset state.

---

## 13. Database Design

Core entities:

```text
users
roles
permissions
role_permissions

tickets
ticket_comments
ticket_attachments
ticket_history

assets
asset_assignments
asset_history

categories
sla_policies

notifications
notification_preferences

audit_logs
security_events

sessions
refresh_tokens
```

Relationships must be enforced through database constraints and application logic.

Important database practices:

- Primary keys
- Foreign keys
- Unique constraints
- Appropriate indexes
- Transaction boundaries
- Pagination
- Controlled query fields
- Avoid unbounded queries
- Soft delete only where business requirements justify it

---

## 14. Redis

Use Redis for:

```text
Caching
Rate limiting
Short-lived state
Queue support
Job coordination
```

Do not use Redis as the authoritative permanent database for core business records.

---

## 15. BullMQ Background Jobs

### Notification Worker

```text
Ticket Created
     |
     v
Queue Job
     |
     v
Notification Worker
     |
     +--> Email
     |
     +--> In-App Notification
```

### SLA Worker

```text
Scheduled Job
     |
     v
Find active tickets
     |
     v
Check SLA deadlines
     |
     +--> approaching SLA
     |
     +--> breached SLA
     |
     v
Escalation
     |
     v
Notification + Audit Event
```

### Report Worker

```text
Report Request
     |
     v
Queue
     |
     v
Generate Report
     |
     v
Store/Deliver Result
```

---

## 16. Logging

Use structured logs.

Example:

```json
{
  "level": "info",
  "event": "ticket.updated",
  "requestId": "request-id",
  "userId": "user-id",
  "ticketId": "ticket-id",
  "timestamp": "..."
}
```

Security event example:

```json
{
  "event": "authentication.failed",
  "requestId": "request-id",
  "userId": "user-id",
  "reason": "invalid_credentials",
  "timestamp": "..."
}
```

Never log:

- Passwords
- Access tokens
- Refresh tokens
- Secrets
- Unnecessary sensitive data

---

## 17. Audit Logging

Record important security/business actions:

```text
LOGIN
LOGOUT
LOGIN_FAILURE
PASSWORD_RESET
USER_CREATED
USER_UPDATED
ROLE_CHANGED
PERMISSION_CHANGED
TICKET_CREATED
TICKET_UPDATED
TICKET_ASSIGNED
TICKET_RESOLVED
ASSET_ASSIGNED
ASSET_RETURNED
ADMIN_ACTION
SECURITY_EVENT
```

Audit records should contain enough context for investigation without storing unnecessary sensitive information.

---

## 18. Error Handling

Use centralized error handling.

Standard response pattern:

```json
{
  "success": false,
  "error": {
    "code": "TICKET_NOT_FOUND",
    "message": "Ticket not found",
    "requestId": "request-id"
  }
}
```

Do not expose:

- Stack traces
- SQL errors
- Internal file paths
- Database credentials
- Infrastructure details

in production API responses.

---

## 19. Backend Security Requirements

Implement:

### Authentication

- Strong password hashing with Argon2id
- Secure token/session design
- Refresh-token rotation where appropriate
- Logout/session revocation
- Authentication failure handling

### Authorization

- RBAC
- Fine-grained permissions
- Object-level authorization
- Server-side enforcement on every protected endpoint

### Input Security

- DTO validation
- Type validation
- Request size limits
- Safe file validation
- Allow-list where practical

### API Security

- HTTPS
- CORS configuration
- Security headers
- Rate limiting
- Request IDs
- Safe error responses
- API versioning

### Database Security

- Parameterized ORM queries
- Least-privilege database account
- Foreign keys
- Constraints
- Indexes
- Transactions

### Operational Security

- Secrets through environment/secret management
- Structured logging
- Audit logs
- Security events
- Health checks
- Dependency updates

---

## 20. Complete Create-Ticket Backend Flow

```text
POST /api/v1/tickets
        |
        v
NGINX
        |
        v
NestJS
        |
        v
Rate Limit
        |
        v
JWT Authentication
        |
        +---- invalid ----> 401
        |
        v
Permission Check
        |
        +---- denied -----> 403
        |
        v
Object/Business Policy
        |
        v
DTO Validation
        |
        +---- invalid ----> 400
        |
        v
Ticket Controller
        |
        v
Ticket Service
        |
        v
Category/User Validation
        |
        v
SLA Calculation
        |
        v
Prisma Transaction
        |
        v
PostgreSQL
        |
        +--> Ticket
        +--> Ticket History
        |
        v
Audit Service
        |
        v
Audit Log
        |
        v
BullMQ
        |
        v
Notification Worker
        |
        v
Response
```

---

## 21. Testing Strategy

### Unit tests

Test:

- Services
- Business rules
- SLA calculations
- Authorization policies
- Utility functions

### Integration tests

Test:

- Controllers
- Database operations
- Authentication
- Authorization
- Transactions

### E2E tests

Test:

```text
Register
Login
Refresh
Logout
Create ticket
Assign ticket
Update ticket
Resolve ticket
Asset assignment
Admin operations
Unauthorized access
Object-level authorization
Rate limiting
Validation errors
```

Security tests must explicitly verify that unauthorized users receive appropriate `401`/`403` responses.

---

## 22. Health and Operational Endpoints

Example:

```text
GET /health
GET /health/live
GET /health/ready
```

Readiness should verify required dependencies such as PostgreSQL/Redis where appropriate.

---

## 23. OpenAPI

Document:

- Endpoints
- Parameters
- Request bodies
- Responses
- Authentication
- Error responses
- Permission requirements

Generate/update OpenAPI documentation as API contracts change.

---

## 24. Docker Architecture

```text
                 Docker Network
                      |
       +--------------+--------------+
       |              |              |
       v              v              v
    NGINX          Backend        PostgreSQL
                     |
                     v
                   Redis
                     |
                     v
                 BullMQ Workers
```

Development may run frontend separately while production can serve the compiled frontend through a suitable web server/CDN.

---

## 25. CI/CD Flow

```text
Developer
    |
    v
Git Push
    |
    v
GitHub Actions
    |
    +--> Lint
    |
    +--> Type Check
    |
    +--> Unit Tests
    |
    +--> Integration Tests
    |
    +--> Build
    |
    +--> Security/Dependency Checks
    |
    v
Build Docker Image
    |
    v
Deploy
    |
    v
Health Check
    |
    v
Production
```

---

## 26. AI Implementation Order

Do not ask AI to generate the complete backend in one prompt.

### Prompt 1 — Foundation

> Build the SecureDesk backend foundation using TypeScript, Node.js and NestJS. Create the project structure, configuration system, environment validation, global error handling, request IDs, structured logging, health checks and API versioning. Do not implement business modules yet.

### Prompt 2 — Database

> Implement the SecureDesk PostgreSQL database layer using Prisma. Create the initial schema for users, roles, permissions, tickets, ticket comments, ticket history, assets, asset assignments, categories, SLA policies, notifications, audit logs, security events, sessions and refresh tokens. Add appropriate relationships, constraints and indexes. Do not implement controllers yet.

### Prompt 3 — Authentication

> Implement SecureDesk authentication using NestJS, Argon2id, JWT and refresh-token/session management. Implement register, login, refresh, logout, forgot-password/reset-password and /auth/me. Do not implement authorization modules yet. Do not expose secrets or password hashes.

### Prompt 4 — Authorization

> Implement SecureDesk RBAC, permissions and object-level authorization. Create guards/decorators/policies that enforce authorization server-side. Define EMPLOYEE, IT_SUPPORT, MANAGER and ADMIN permissions. Add tests proving users cannot access unauthorized resources.

### Prompt 5 — Tickets

> Implement the SecureDesk ticket module with controller, DTOs, service, repository/data-access layer, business rules, status transitions, priority, assignment, comments and history. Enforce authentication, permission checks and object-level authorization on every protected operation.

### Prompt 6 — Assets

> Implement the SecureDesk asset management module including assets, assignment, return, maintenance, retirement and asset history. Enforce role and object-level authorization and validate state transitions.

### Prompt 7 — SLA

> Implement SecureDesk SLA policies and SLA calculation. Create business rules for response/resolution deadlines and escalation conditions. Keep SLA calculations testable and deterministic.

### Prompt 8 — Notifications + Queue

> Implement Redis and BullMQ for SecureDesk background jobs. Create notification workers, SLA monitoring workers and report workers. Make jobs retry-safe and prevent duplicate side effects where required.

### Prompt 9 — Audit + Security

> Implement SecureDesk audit logging and security event recording. Record important authentication, authorization, user, role, ticket, asset and admin actions without logging passwords, tokens or secrets.

### Prompt 10 — Reports

> Implement SecureDesk reporting APIs for ticket volume, status, SLA performance, resolution time, asset inventory and relevant operational metrics. Add pagination/filtering and authorization.

### Prompt 11 — OpenAPI

> Add complete OpenAPI/Swagger documentation for all SecureDesk API endpoints, request schemas, response schemas, authentication requirements and authorization requirements.

### Prompt 12 — Testing

> Add comprehensive SecureDesk unit, integration and E2E tests. Prioritize authentication, authorization, object-level authorization, ticket workflows, asset workflows, SLA logic, validation, rate limiting and error handling.

### Prompt 13 — Docker/Production

> Containerize the SecureDesk backend with Docker. Configure production-safe environment variables, PostgreSQL, Redis, BullMQ workers, Nginx and health checks. Do not hard-code secrets.

---

## 27. Backend Definition of Done

Backend is ready when:

- TypeScript builds successfully.
- Database migrations work.
- Authentication works.
- Authorization is server-side.
- Object-level authorization is tested.
- Ticket workflows work.
- Asset workflows work.
- SLA processing works.
- Background jobs work.
- Audit/security logging works.
- Errors are centralized.
- Secrets are not hard-coded.
- API documentation is available.
- Critical endpoints are tested.
- Docker deployment works.
- Health checks work.
- Production responses do not expose internal details.

---

## 28. Non-Negotiable Security Principle

```text
NEVER TRUST THE CLIENT.
```

The frontend can request an action.

Only the backend can authorize and execute it.

```text
Frontend
   |
   | "I want to update ticket 123"
   v
Backend
   |
   +--> Authenticated?
   |
   +--> Has permission?
   |
   +--> Can this user access ticket 123?
   |
   +--> Is requested change valid?
   |
   +--> Apply business rules
   |
   +--> Database transaction
   |
   +--> Audit event
   |
   v
Execute
```

This rule applies to every sensitive operation in SecureDesk.
