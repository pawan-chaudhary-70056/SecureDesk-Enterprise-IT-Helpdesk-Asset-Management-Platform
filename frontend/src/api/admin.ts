import { api } from "./client";
import type { AdminUser, AuditLogEntry, Paginated, RoleWithPermissions, SecurityEventEntry } from "@/types";

export interface TicketReport {
  total: number;
  byStatus: { status: string; count: number }[];
  byPriority: { priority: string; count: number }[];
}
export interface ResolutionReport {
  count: number;
  medianHours: number;
  p90Hours: number;
  averageHours: number;
}
export interface SlaReport {
  ticketsWithSla: number;
  currentlyBreached: number;
  approachingDeadline: number;
}
export interface AssetReport {
  total: number;
  byStatus: { status: string; count: number }[];
}

export async function fetchTicketReport(): Promise<TicketReport> {
  const r = await api.get<TicketReport>("/reports/tickets");
  return r.data;
}
export async function fetchResolutionReport(): Promise<ResolutionReport> {
  const r = await api.get<ResolutionReport>("/reports/resolution-times");
  return r.data;
}
export async function fetchSlaReport(): Promise<SlaReport> {
  const r = await api.get<SlaReport>("/reports/sla");
  return r.data;
}
export async function fetchAssetReport(): Promise<AssetReport> {
  const r = await api.get<AssetReport>("/reports/assets");
  return r.data;
}

// ── Admin: users, roles, audit, security ─────────────────────

export async function fetchUsers(params: { q?: string; role?: string; page?: number; pageSize?: number } = {}): Promise<Paginated<AdminUser>> {
  const r = await api.get<Paginated<AdminUser>>("/users", { params });
  return r.data;
}

export async function createUser(dto: { email: string; name: string; password: string; role: string }): Promise<AdminUser> {
  const r = await api.post<AdminUser>("/users", dto);
  return r.data;
}

export async function updateUser(id: string, dto: { name?: string; role?: string; isActive?: boolean }): Promise<AdminUser> {
  const r = await api.patch<AdminUser>(`/users/${id}`, dto);
  return r.data;
}

export async function fetchRoles(): Promise<RoleWithPermissions[]> {
  const r = await api.get<RoleWithPermissions[]>("/roles");
  return r.data;
}

export async function updateRolePermissions(id: string, permissionNames: string[]): Promise<void> {
  await api.patch(`/roles/${id}`, { permissionNames });
}

export async function fetchAuditLogs(params: { page?: number; pageSize?: number } = {}): Promise<Paginated<AuditLogEntry>> {
  const r = await api.get<Paginated<AuditLogEntry>>("/audit", { params });
  return r.data;
}

export async function fetchSecurityEvents(params: { page?: number; pageSize?: number } = {}): Promise<Paginated<SecurityEventEntry>> {
  const r = await api.get<Paginated<SecurityEventEntry>>("/security", { params });
  return r.data;
}
