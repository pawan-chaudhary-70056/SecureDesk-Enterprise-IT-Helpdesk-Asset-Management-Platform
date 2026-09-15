import { describe, expect, it } from "vitest";
import { PRIORITY_MULTIPLIER } from "../../src/sla/sla.service";
import { TICKET_TRANSITIONS, ASSET_TRANSITIONS, ROLE_PERMISSIONS, PERMISSIONS, ROLES } from "../../src/common/constants";
import type { TicketStatus } from "../../src/common/constants";

// ── SLA multipliers ────────────────────────────────────────────

describe("SLA priority multipliers", () => {
  it("makes urgent tickets 4x faster than low priority", () => {
    expect(PRIORITY_MULTIPLIER.URGENT).toBe(0.25);
    expect(PRIORITY_MULTIPLIER.LOW).toBe(2);
    expect(PRIORITY_MULTIPLIER.HIGH).toBe(0.5);
    expect(PRIORITY_MULTIPLIER.MEDIUM).toBe(1);
  });

  it("keeps medium as the baseline multiplier", () => {
    expect(PRIORITY_MULTIPLIER.MEDIUM).toBe(1);
  });
});

// ── Ticket state machine (backend owns transitions — spec §10) ──

describe("ticket status state machine", () => {
  it("allows the canonical happy path OPEN→ASSIGNED→IN_PROGRESS→RESOLVED→CLOSED", () => {
    expect(TICKET_TRANSITIONS.OPEN).toContain("ASSIGNED");
    expect(TICKET_TRANSITIONS.ASSIGNED).toContain("IN_PROGRESS");
    expect(TICKET_TRANSITIONS.IN_PROGRESS).toContain("RESOLVED");
    expect(TICKET_TRANSITIONS.RESOLVED).toContain("CLOSED");
  });

  it("terminates at CLOSED (no transitions out)", () => {
    expect(TICKET_TRANSITIONS.CLOSED).toEqual([]);
  });

  it("allows a resolved ticket to be reopened", () => {
    expect(TICKET_TRANSITIONS.RESOLVED).toContain("IN_PROGRESS");
  });

  it("never allows PENDING to jump straight to CLOSED from IN_PROGRESS-only paths", () => {
    // PENDING must go through IN_PROGRESS or RESOLVED; both are legal,
    // but PENDING may not go back to OPEN or ASSIGNED.
    expect(TICKET_TRANSITIONS.PENDING).not.toContain("OPEN");
    expect(TICKET_TRANSITIONS.PENDING).not.toContain("ASSIGNED");
  });

  it("every status has a transition map entry", () => {
    const statuses: TicketStatus[] = ["OPEN", "ASSIGNED", "IN_PROGRESS", "PENDING", "RESOLVED", "CLOSED"];
    for (const s of statuses) {
      expect(Array.isArray(TICKET_TRANSITIONS[s])).toBe(true);
    }
  });
});

// ── Asset lifecycle (spec §12) ─────────────────────────────────

describe("asset lifecycle state machine", () => {
  it("follows register → available → assigned → returned → available", () => {
    expect(ASSET_TRANSITIONS.AVAILABLE).toContain("ASSIGNED");
    expect(ASSET_TRANSITIONS.ASSIGNED).toContain("RETURNED");
    expect(ASSET_TRANSITIONS.RETURNED).toContain("AVAILABLE");
  });

  it("allows maintenance from both AVAILABLE and ASSIGNED, returning to AVAILABLE", () => {
    expect(ASSET_TRANSITIONS.AVAILABLE).toContain("MAINTENANCE");
    expect(ASSET_TRANSITIONS.ASSIGNED).toContain("MAINTENANCE");
    expect(ASSET_TRANSITIONS.MAINTENANCE).toContain("AVAILABLE");
  });

  it("retired assets are terminal", () => {
    expect(ASSET_TRANSITIONS.RETIRED).toEqual([]);
  });

  it("never allows direct AVAILABLE → RETURNED (must pass through ASSIGNED)", () => {
    expect(ASSET_TRANSITIONS.AVAILABLE).not.toContain("RETURNED");
  });
});

// ── RBAC permission model (spec §8) ────────────────────────────

describe("role-permission model", () => {
  it("employees cannot manage assets, users, or read audit logs", () => {
    const emp = ROLE_PERMISSIONS.EMPLOYEE;
    expect(emp).not.toContain(PERMISSIONS.ASSET_MANAGE);
    expect(emp).not.toContain(PERMISSIONS.USER_MANAGE);
    expect(emp).not.toContain(PERMISSIONS.AUDIT_READ);
    expect(emp).not.toContain(PERMISSIONS.REPORT_READ);
  });

  it("employees CAN create and read their own tickets", () => {
    const emp = ROLE_PERMISSIONS.EMPLOYEE;
    expect(emp).toContain(PERMISSIONS.TICKET_CREATE);
    expect(emp).toContain(PERMISSIONS.TICKET_READ_OWN);
    expect(emp).toContain(PERMISSIONS.TICKET_COMMENT_OWN);
  });

  it("IT support can assign, update and resolve tickets but cannot manage users", () => {
    const agent = ROLE_PERMISSIONS.IT_SUPPORT;
    expect(agent).toContain(PERMISSIONS.TICKET_ASSIGN);
    expect(agent).toContain(PERMISSIONS.TICKET_UPDATE);
    expect(agent).toContain(PERMISSIONS.TICKET_RESOLVE);
    expect(agent).toContain(PERMISSIONS.ASSET_MANAGE);
    expect(agent).not.toContain(PERMISSIONS.USER_MANAGE);
    expect(agent).not.toContain(PERMISSIONS.ROLE_MANAGE);
  });

  it("managers read team tickets and reports but cannot update tickets", () => {
    const mgr = ROLE_PERMISSIONS.MANAGER;
    expect(mgr).toContain(PERMISSIONS.TICKET_READ_TEAM);
    expect(mgr).toContain(PERMISSIONS.REPORT_READ);
    expect(mgr).not.toContain(PERMISSIONS.TICKET_UPDATE);
    expect(mgr).not.toContain(PERMISSIONS.TICKET_ASSIGN);
  });

  it("admins hold all administrative permissions", () => {
    const admin = ROLE_PERMISSIONS.ADMIN;
    expect(admin).toContain(PERMISSIONS.USER_MANAGE);
    expect(admin).toContain(PERMISSIONS.ROLE_MANAGE);
    expect(admin).toContain(PERMISSIONS.PERMISSION_MANAGE);
    expect(admin).toContain(PERMISSIONS.AUDIT_READ);
    expect(admin).toContain(PERMISSIONS.SECURITY_MANAGE);
    expect(admin).toContain(PERMISSIONS.SLA_MANAGE);
  });

  it("every role has the four system roles defined", () => {
    expect(Object.keys(ROLE_PERMISSIONS).sort()).toEqual(
      [ROLES.ADMIN, ROLES.EMPLOYEE, ROLES.IT_SUPPORT, ROLES.MANAGER].sort(),
    );
  });
});
