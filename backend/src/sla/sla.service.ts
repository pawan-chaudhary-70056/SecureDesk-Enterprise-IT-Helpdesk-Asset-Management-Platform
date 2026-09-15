import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { AuditService } from "../audit/audit.service";
import { NOTIFICATION_TYPES, AUDIT_ACTIONS, TICKET_PRIORITIES, type TicketPriority } from "../common/constants";
import { logger } from "../common/middleware/http-logger.middleware";

/** Priority multiplier applied to policy minutes (keeps SLA deterministic/testable). */
export const PRIORITY_MULTIPLIER: Record<TicketPriority, number> = {
  LOW: 2,
  MEDIUM: 1,
  HIGH: 0.5,
  URGENT: 0.25,
};

export interface SlaDeadlines {
  firstResponseDueAt: Date | null;
  resolutionDueAt: Date | null;
}

/**
 * SLA engine: resolves the effective policy for a ticket (category-specific
 * first, then the default policy) and computes deadlines. The scan/escalation
 * path is idempotent — one notification per (ticket, type).
 */
@Injectable()
export class SlaService {
  /** SLA warning window in minutes before a deadline. */
  static warningWindowMinutes = 60;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async computeDeadlines(categoryId: string | null | undefined, priority: string, createdAt = new Date()): Promise<SlaDeadlines> {
    const policy = await this.resolvePolicy(categoryId);
    if (!policy) return { firstResponseDueAt: null, resolutionDueAt: null };

    const mult = PRIORITY_MULTIPLIER[(TICKET_PRIORITIES as readonly string[]).includes(priority) ? (priority as TicketPriority) : "MEDIUM"];
    return {
      firstResponseDueAt: new Date(createdAt.getTime() + policy.firstResponseMinutes * 60_000 * mult),
      resolutionDueAt: new Date(createdAt.getTime() + policy.resolutionMinutes * 60_000 * mult),
    };
  }

  async resolvePolicy(categoryId: string | null | undefined) {
    if (categoryId) {
      const catPolicy = await this.prisma.slaPolicy.findFirst({
        where: { categoryId, isActive: true },
        orderBy: { createdAt: "desc" },
      });
      if (catPolicy) return catPolicy;
    }
    return this.prisma.slaPolicy.findFirst({
      where: { categoryId: null, isActive: true },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Periodic scan: notifies about tickets approaching their SLA and escalates
   * breached ones. Idempotent — repeat scans do not duplicate notifications.
   */
  async scanAndEscalate(): Promise<{ warned: number; breached: number }> {
    const now = new Date();
    const warnFrom = new Date(now.getTime() + SlaService.warningWindowMinutes * 60_000);

    const active = await this.prisma.ticket.findMany({
      where: { status: { notIn: ["RESOLVED", "CLOSED"] } },
      select: { id: true, title: true, requesterId: true, assigneeId: true, slaFirstResponseDueAt: true, slaResolutionDueAt: true },
    });

    let warned = 0;
    let breached = 0;

    for (const t of active) {
      const deadlines = [t.slaFirstResponseDueAt, t.slaResolutionDueAt].filter((d): d is Date => !!d);
      if (deadlines.length === 0) continue;
      const nearest = deadlines.reduce((a, b) => (a.getTime() < b.getTime() ? a : b));
      const watchers = [t.assigneeId, t.requesterId].filter((id): id is string => !!id);

      if (nearest.getTime() < now.getTime()) {
        const created = await this.notifyOnce(t.id, watchers, NOTIFICATION_TYPES.SLA_BREACH, "SLA breached", `Ticket "${t.title}" has breached its SLA deadline.`);
        if (created) {
          breached++;
          await this.audit.record({ action: AUDIT_ACTIONS.ADMIN_ACTION, entityType: "Ticket", entityId: t.id, detail: "sla_breach_escalated" });
        }
      } else if (nearest.getTime() <= warnFrom.getTime()) {
        const created = await this.notifyOnce(t.id, watchers, NOTIFICATION_TYPES.SLA_WARNING, "SLA deadline approaching", `Ticket "${t.title}" is approaching its SLA deadline.`);
        if (created) warned++;
      }
    }
    if (warned || breached) {
      logger.info({ event: "sla.scan", warned, breached });
    }
    return { warned, breached };
  }

  private async notifyOnce(ticketId: string, userIds: string[], type: string, title: string, body: string): Promise<boolean> {
    if (userIds.length === 0) return false;
    const existing = await this.prisma.notification.findFirst({
      where: { ticketId, type, userId: { in: userIds } },
      select: { id: true },
    });
    if (existing) return false;
    await this.prisma.notification.createMany({
      data: userIds.map((userId) => ({ userId, ticketId, type, title, body })),
    });
    return true;
  }

  // ── Policy CRUD (admin) ──────────────────────────────────────

  listPolicies() {
    return this.prisma.slaPolicy.findMany({ include: { category: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" } });
  }

  async createPolicy(data: { name: string; categoryId?: string | null; firstResponseMinutes: number; resolutionMinutes: number }) {
    const exists = await this.prisma.slaPolicy.findUnique({ where: { name: data.name } });
    if (exists) throw new ConflictException("SLA policy name already exists");
    const policy = await this.prisma.slaPolicy.create({ data: { ...data, categoryId: data.categoryId ?? null } });
    await this.audit.record({ action: AUDIT_ACTIONS.SLA_POLICY_CHANGED, entityType: "SlaPolicy", entityId: policy.id, detail: "created" });
    return policy;
  }

  async updatePolicy(id: string, data: { name?: string; firstResponseMinutes?: number; resolutionMinutes?: number; isActive?: boolean }) {
    // Prisma update on a missing id throws P2025 — surface a clean 404 instead.
    const policy = await this.prisma.slaPolicy.findUnique({ where: { id } });
    if (!policy) throw new NotFoundException("SLA policy not found");
    const updated = await this.prisma.slaPolicy.update({ where: { id }, data });
    await this.audit.record({ action: AUDIT_ACTIONS.SLA_POLICY_CHANGED, entityType: "SlaPolicy", entityId: id, detail: "updated" });
    return updated;
  }
}
