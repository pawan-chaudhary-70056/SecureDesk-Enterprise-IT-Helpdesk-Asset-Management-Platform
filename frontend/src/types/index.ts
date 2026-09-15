/** Shared frontend types mirroring the backend API contracts. */

export type RoleName = "EMPLOYEE" | "IT_SUPPORT" | "MANAGER" | "ADMIN";

export type PermissionName =
  | "ticket:create"
  | "ticket:read:own"
  | "ticket:read:assigned"
  | "ticket:read:team"
  | "ticket:read:all"
  | "ticket:update"
  | "ticket:update:own"
  | "ticket:resolve"
  | "ticket:resolve:own"
  | "ticket:close"
  | "ticket:assign"
  | "ticket:comment"
  | "ticket:comment:own"
  | "ticket:delete"
  | "asset:read:own"
  | "asset:read:all"
  | "asset:manage"
  | "report:read"
  | "user:manage"
  | "role:manage"
  | "permission:manage"
  | "category:manage"
  | "sla:manage"
  | "audit:read"
  | "security:manage"
  | "notification:read:own";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: RoleName;
  permissions: PermissionName[];
}

export interface MeResponse {
  id: string;
  email: string;
  name: string;
  role: { name: RoleName; permissions: { permission: { name: PermissionName } }[] };
  lastLoginAt: string | null;
  createdAt: string;
}

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

export interface Category {
  id: string;
  name: string;
  description?: string | null;
}

export interface TicketRef {
  id: string;
  name: string;
  email: string;
}

export interface Ticket {
  id: string;
  title: string;
  description: string;
  status: "OPEN" | "ASSIGNED" | "IN_PROGRESS" | "PENDING" | "RESOLVED" | "CLOSED";
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  category?: { id: string; name: string } | null;
  requester: TicketRef;
  assignee?: TicketRef | null;
  slaFirstResponseDueAt?: string | null;
  slaResolutionDueAt?: string | null;
  firstRespondedAt?: string | null;
  resolvedAt?: string | null;
  closedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TicketComment {
  id: string;
  body: string;
  isInternal: boolean;
  author: TicketRef;
  createdAt: string;
}

export interface TicketHistoryEntry {
  id: string;
  action: string;
  detail?: string | null;
  actor?: { id: string; name: string } | null;
  createdAt: string;
}

export interface TicketAttachment {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  uploader: { id: string; name: string };
  createdAt: string;
}

export interface TicketDetail extends Ticket {
  comments: TicketComment[];
  attachments: TicketAttachment[];
  history: TicketHistoryEntry[];
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Asset {
  id: string;
  assetTag: string;
  name: string;
  serialNumber?: string | null;
  status: "AVAILABLE" | "ASSIGNED" | "MAINTENANCE" | "RETURNED" | "RETIRED";
  category?: { id: string; name: string } | null;
  assignedTo?: TicketRef | null;
  location?: string | null;
  purchasedAt?: string | null;
  warrantyUntil?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AssetDetail extends Asset {
  history: { id: string; action: string; detail?: string | null; actor?: { id: string; name: string } | null; createdAt: string }[];
  assignments: { id: string; user: TicketRef; assignedAt: string; returnedAt?: string | null; notes?: string | null }[];
}

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  ticketId?: string | null;
  readAt?: string | null;
  createdAt: string;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
  lastLoginAt?: string | null;
  createdAt: string;
  role: { id: string; name: RoleName };
}

export interface RoleWithPermissions {
  id: string;
  name: string;
  description?: string | null;
  permissions: { permission: { name: PermissionName } }[];
}

export interface AuditLogEntry {
  id: string;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  detail?: string | null;
  ip?: string | null;
  actor?: { id: string; name: string; email: string } | null;
  createdAt: string;
}

export interface SecurityEventEntry {
  id: string;
  type: string;
  detail?: string | null;
  ip?: string | null;
  email?: string | null;
  createdAt: string;
}

/** API error envelope from the backend (spec §18). */
export interface ApiErrorBody {
  success: false;
  error: { code: string; message: string; requestId?: string };
}
