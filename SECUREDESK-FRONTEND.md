# SecureDesk — Enterprise IT Helpdesk & Asset Management Platform
## Frontend Architecture & Development Specification

**Document Type:** Production-Oriented Frontend Architecture  
**Version:** 1.0  
**Primary Language:** TypeScript  
**Framework:** React + Vite  
**Purpose:** Human- and AI-readable implementation blueprint

---

## 1. Project Overview

SecureDesk is an enterprise IT Helpdesk and Asset Management Platform.

The frontend provides role-aware interfaces for:

- Employees
- IT Support
- Managers
- Administrators

Core capabilities:

- Authentication
- Dashboard
- Ticket management
- Ticket comments and attachments
- Asset management
- Notifications
- Reports
- Administration
- Role/permission-aware UI
- Secure API communication

The frontend must **never be treated as the security boundary**. UI permissions improve usability, but every authorization decision must be enforced by the backend.

---

## 2. Frontend Technology Stack

| Area | Technology |
|---|---|
| Language | TypeScript |
| UI | React |
| Build | Vite |
| Routing | React Router |
| Server/API state | TanStack Query |
| Forms | React Hook Form |
| Validation | Zod |
| HTTP | Axios or Fetch |
| Styling | Tailwind CSS |
| Charts | Recharts |
| Testing | Vitest + React Testing Library + Playwright |

---

## 3. Frontend Architecture Flow

```text
USER
  |
  v
React UI
  |
  v
Page / Feature Component
  |
  v
React Hook Form
  |
  v
Zod Client Validation
  |
  v
TanStack Query
  |
  v
API Client (Axios/Fetch)
  |
  | HTTPS
  v
NGINX / Reverse Proxy
  |
  v
Backend REST API
  |
  v
Response
  |
  v
TanStack Query Cache
  |
  v
React UI Update
```

### Important Security Rule

```text
Frontend validation = usability
Backend validation = security
Frontend permission check = UX
Backend authorization = security
```

Never trust:

- Hidden buttons
- Disabled inputs
- Route guards
- Client-side roles
- Client-side validation
- Values stored only in browser storage

---

## 4. Frontend Folder Structure

```text
frontend/
|
├── src/
│   |
│   ├── app/
│   │   ├── App.tsx
│   │   ├── router.tsx
│   │   └── providers.tsx
│   |
│   ├── components/
│   │   ├── ui/
│   │   ├── forms/
│   │   ├── tables/
│   │   ├── modals/
│   │   └── layouts/
│   |
│   ├── features/
│   │   ├── auth/
│   │   ├── tickets/
│   │   ├── assets/
│   │   ├── users/
│   │   ├── notifications/
│   │   ├── reports/
│   │   └── admin/
│   |
│   ├── pages/
│   │   ├── Login/
│   │   ├── Dashboard/
│   │   ├── Tickets/
│   │   ├── Assets/
│   │   ├── Reports/
│   │   └── Admin/
│   |
│   ├── api/
│   │   ├── client.ts
│   │   ├── auth.ts
│   │   ├── tickets.ts
│   │   ├── assets.ts
│   │   └── users.ts
│   |
│   ├── hooks/
│   ├── schemas/
│   ├── types/
│   ├── utils/
│   └── constants/
|
├── public/
├── tests/
├── package.json
└── vite.config.ts
```

---

## 5. Frontend Module Responsibilities

### app/

Application bootstrap, providers, routing and global configuration.

### components/

Reusable presentation components.

### features/

Business-specific UI logic. Each feature should contain its own components, hooks, schemas and API functions where practical.

### pages/

Route-level screens.

### api/

Centralized API communication.

### hooks/

Reusable React hooks.

### schemas/

Client-side validation schemas.

### types/

Shared frontend TypeScript types.

### utils/

Pure reusable utility functions.

### constants/

Application constants that are safe to expose to clients.

---

## 6. User Roles

### EMPLOYEE

Allowed UI capabilities:

- Create own ticket
- View own tickets
- Comment on permitted tickets
- Upload permitted attachments
- View own assigned assets
- View notifications
- Update own profile where allowed

Must not access:

- Other employees' private tickets
- Admin functions
- Role management
- Security administration
- System-wide reports unless explicitly permitted

### IT_SUPPORT

Allowed UI capabilities:

- View assigned/permitted tickets
- Investigate tickets
- Update tickets
- Add comments
- Manage permitted assets
- Resolve tickets
- View relevant operational dashboards

Must not access:

- Global administration unless separately authorized
- Role/permission administration
- Security administration unless explicitly authorized

### MANAGER

Allowed UI capabilities:

- View team tickets
- Review operational reports
- Approve permitted requests
- View relevant SLA information

Must not automatically gain:

- System administration
- User role management
- Security administration

### ADMIN

Allowed UI capabilities:

- User management
- Role management
- Permission management
- Asset administration
- SLA configuration
- Reports
- Audit logs
- Security events
- System settings

Backend authorization remains mandatory for every operation.

---

## 7. Frontend Routes

```text
/
├── /login
├── /dashboard
├── /tickets
├── /tickets/:id
├── /assets
├── /assets/:id
├── /notifications
├── /reports
├── /profile
└── /admin
    ├── /users
    ├── /roles
    ├── /permissions
    ├── /tickets
    ├── /assets
    ├── /sla
    ├── /reports
    ├── /audit
    ├── /security
    └── /settings
```

Route guards may hide pages from unauthorized users, but the backend must enforce the same authorization independently.

---

## 8. Frontend API Flow

Example: Create Ticket

```text
User
 |
 v
Create Ticket Page
 |
 v
React Hook Form
 |
 v
Zod Validation
 |
 +---- invalid ----> Display validation error
 |
 v
TanStack Mutation
 |
 v
POST /api/v1/tickets
 |
 v
Backend
 |
 v
Response
 |
 +---- 401 ----> Refresh/login flow
 |
 +---- 403 ----> Permission error
 |
 +---- 400 ----> Display validation error
 |
 +---- 409 ----> Display conflict
 |
 +---- 5xx ---> Generic server error
 |
 v
Invalidate/Update ticket query
 |
 v
UI refresh
```

---

## 9. Frontend Security Requirements

Implement:

1. HTTPS-only production communication.
2. Strict API origin configuration.
3. No secrets in frontend source.
4. Never place database credentials in frontend code.
5. Never trust client-side role values.
6. Validate API responses where useful.
7. Sanitize/render untrusted content safely.
8. Restrict file upload UI and rely on backend validation.
9. Handle token expiry safely.
10. Do not expose sensitive backend error details.
11. Do not log access tokens.
12. Avoid storing sensitive information unnecessarily.
13. Use secure production headers through the deployment layer.
14. Keep dependencies updated.
15. Apply route guards for UX, not authorization.

---

## 10. Authentication UX Flow

```text
Login
 |
 v
POST /api/v1/auth/login
 |
 v
Backend authenticates
 |
 v
Session/token established
 |
 v
Frontend loads /auth/me
 |
 v
User + permissions loaded
 |
 v
Permission-aware navigation
 |
 v
Dashboard
```

If the access token expires:

```text
API request
 |
 v
401
 |
 v
Refresh authentication
 |
 +---- success ---> retry request
 |
 +---- failure ---> logout + login
```

Do not create an infinite refresh loop.

---

## 11. Ticket UI Flow

```text
Create
  |
  v
Open
  |
  v
Assigned
  |
  v
In Progress
  |
  v
Pending
  |
  v
Resolved
  |
  v
Closed
```

The frontend displays valid transitions returned/defined by backend business rules, but the backend decides whether a transition is actually allowed.

---

## 12. Asset UI Flow

```text
Register Asset
      |
      v
Available
      |
      v
Assign
      |
      v
Assigned
      |
      +------> Maintenance
      |             |
      |             v
      |         Available
      |
      v
Returned
      |
      v
Available
      |
      v
Retired
```

---

## 13. Frontend Testing

### Unit

Test:

- Components
- Hooks
- Utility functions
- Validation
- Permission-aware rendering

### Integration

Test:

- Forms
- API interactions
- Query states
- Error handling
- Authentication state

### E2E

Test:

```text
Login
Create ticket
View ticket
Comment
Assign ticket
Resolve ticket
Manage asset
Admin operations
Unauthorized navigation
Expired authentication
```

---

## 14. AI Implementation Order

Do not ask an AI to generate the entire frontend at once.

Use these prompts sequentially:

### Prompt 1 — Foundation

> Build the SecureDesk frontend foundation using React, TypeScript and Vite. Create the app structure, TypeScript configuration, environment configuration, global providers, routing foundation and error boundaries. Do not implement business modules yet.

### Prompt 2 — UI system

> Implement SecureDesk reusable UI components, layouts, forms, tables, modals, loading states, error states and responsive design using Tailwind CSS. Keep components reusable and accessible.

### Prompt 3 — API client

> Implement the SecureDesk typed API client using Axios or Fetch. Add centralized request handling, authentication handling, error normalization, timeout configuration and typed API responses. Never expose secrets.

### Prompt 4 — Authentication

> Implement SecureDesk login, logout, session restoration, authentication state and protected routes. The frontend must not make authorization decisions that replace backend authorization.

### Prompt 5 — Tickets

> Implement the SecureDesk ticket feature including ticket list, detail page, create/edit forms, comments, status display, priority display, assignment UI and TanStack Query integration.

### Prompt 6 — Assets

> Implement the SecureDesk asset feature including inventory, asset detail, assignment, return, maintenance and history UI.

### Prompt 7 — Admin

> Implement the SecureDesk admin frontend for users, roles, permissions, tickets, assets, SLA, reports, audit logs, security events and settings. Make every admin route permission-aware.

### Prompt 8 — Testing

> Add unit, integration and Playwright E2E tests for the SecureDesk frontend. Include unauthorized access, authentication failure, form validation and API error scenarios.

---

## 15. Frontend Definition of Done

Frontend is ready when:

- TypeScript has no unexpected errors.
- Production build succeeds.
- All important routes work.
- API errors are handled.
- Authentication flow works.
- Permission-aware UI works.
- No secrets are exposed.
- Forms validate correctly.
- Loading/empty/error states exist.
- Accessibility basics are implemented.
- Tests cover critical workflows.
- Frontend does not assume that UI restrictions provide security.
