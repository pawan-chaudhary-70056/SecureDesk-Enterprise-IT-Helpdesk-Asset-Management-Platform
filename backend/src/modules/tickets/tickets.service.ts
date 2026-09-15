import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { SlaService } from "../../sla/sla.service";
import { AuditService } from "../../audit/audit.service";
import { JobsService } from "../../jobs/jobs.service";
import { assertPermission, type RequestUser } from "../../common/guards/auth.guard";
import {
  AUDIT_ACTIONS,
  NOTIFICATION_TYPES,
  PERMISSIONS,
  ROLES,
  TICKET_TRANSITIONS,
  type TicketStatus,
} from "../../common/constants";
import type {
  AssignDto,
  CommentDto,
  CreateTicketDto,
  ListQueryDto,
  PriorityDto,
  StatusDto,
  UpdateTicketDto,
} from "./tickets.schema";

const ticketInclude = {
  category: { select: { id: true, name: true } },
  requester: { select: { id: true, name: true, email: true } },
  assignee: { select: { id: true, name: true, email: true } },
} as const;

/**
 * Ticket business logic. Every method re-verifies object-level access —
 * permissions from the guard are necessary but never sufficient.
 */
@Injectable()
export class TicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sla: SlaService,
    private readonly audit: AuditService,
    private readonly jobs: JobsService,
  ) {}

  // ── Object-level authorization ───────────────────────────────

  private canViewAll(user: RequestUser): boolean {
    return user.permissions.includes(PERMISSIONS.TICKET_READ_ALL);
  }

  private async getTicketOr404(id: string) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id }, include: ticketInclude });
    if (!ticket) throw new NotFoundException("Ticket not found");
    return ticket;
  }

  private assertCanView(user: RequestUser, ticket: { requesterId: string; assigneeId: string | null; status: string }): void {
    if (this.canViewAll(user)) return;
    if (ticket.requesterId === user.id) return;
    if (
      ticket.assigneeId === user.id ||
      (ticket.status === "OPEN" && ticket.assigneeId === null && user.permissions.includes(PERMISSIONS.TICKET_READ_ASSIGNED))
    ) {
      return;
    }
    throw new ForbiddenException("You do not have access to this ticket");
  }

  private async assertCanViewById(user: RequestUser, id: string) {
    const ticket = await this.getTicketOr404(id);
    this.assertCanView(user, ticket);
    return ticket;
  }

  // ── Queries ──────────────────────────────────────────────────

  async list(user: RequestUser, q: ListQueryDto) {
    const where = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.priority ? { priority: q.priority } : {}),
      ...(q.categoryId ? { categoryId: q.categoryId } : {}),
      ...(q.q
        ? {
            OR: [
              { title: { contains: q.q } },
              { description: { contains: q.q } },
            ],
          }
        : {}),
    };

    // Object-level scope: agents can see the unassigned queue + their own;
    // everyone else only their own tickets. read:all sees everything.
    if (!this.canViewAll(user)) {
      const mine: Prisma.TicketWhereInput[] = [{ requesterId: user.id }];
      if (user.permissions.includes(PERMISSIONS.TICKET_READ_ASSIGNED)) {
        mine.push({ assigneeId: user.id }, { assigneeId: null, status: "OPEN" });
      }
      Object.assign(where, { AND: [where, { OR: mine }] });
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.ticket.findMany({
        where,
        include: ticketInclude,
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.ticket.count({ where }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  }

  async getById(user: RequestUser, id: string) {
    const ticket = await this.assertCanViewById(user, id);
    const [comments, attachments, history] = await Promise.all([
      this.prisma.ticketComment.findMany({
        where: { ticketId: id },
        include: { author: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.ticketAttachment.findMany({
        where: { ticketId: id },
        include: { uploader: { select: { id: true, name: true } } },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.ticketHistory.findMany({
        where: { ticketId: id },
        include: { actor: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    // Employees never see internal notes (defense in depth — filtered again on write).
    const isAgent = this.canViewAll(user) || user.permissions.includes(PERMISSIONS.TICKET_UPDATE);
    const visibleComments = isAgent ? comments : comments.filter((c) => !c.isInternal);
    return { ...ticket, comments: visibleComments, attachments, history };
  }

  // ── Create ───────────────────────────────────────────────────

  async create(user: RequestUser, dto: CreateTicketDto) {
    assertPermission(user, PERMISSIONS.TICKET_CREATE);
    if (dto.categoryId) await this.assertCategoryExists(dto.categoryId);

    const deadlines = await this.sla.computeDeadlines(dto.categoryId, dto.priority);

    const ticket = await this.prisma.ticket.create({
      data: {
        title: dto.title,
        description: dto.description,
        priority: dto.priority,
        categoryId: dto.categoryId ?? null,
        requesterId: user.id, // never trust the client for requester
        slaFirstResponseDueAt: deadlines.firstResponseDueAt,
        slaResolutionDueAt: deadlines.resolutionDueAt,
        history: {
          create: { actorId: user.id, action: "CREATED", detail: `priority=${dto.priority}` },
        },
      },
      include: ticketInclude,
    });

    await this.audit.record({
      actorId: user.id,
      action: AUDIT_ACTIONS.TICKET_CREATED,
      entityType: "Ticket",
      entityId: ticket.id,
      detail: { title: ticket.title, priority: ticket.priority },
    });

    // Notify the support queue (all active IT_SUPPORT users).
    const agents = await this.prisma.user.findMany({
      where: { isActive: true, role: { name: ROLES.IT_SUPPORT } },
      select: { id: true },
    });
    await this.jobs.enqueueNotification({
      userIds: [...agents.map((a) => a.id), user.id],
      type: NOTIFICATION_TYPES.TICKET_CREATED,
      title: "Ticket created",
      body: `New ticket "${ticket.title}" (${ticket.priority})`,
      ticketId: ticket.id,
    });
    return ticket;
  }

  // ── Update (fields) ──────────────────────────────────────────

  async update(user: RequestUser, id: string, dto: UpdateTicketDto) {
    const ticket = await this.assertCanViewById(user, id);

    const isOwnerEdit =
      ticket.requesterId === user.id &&
      user.permissions.includes(PERMISSIONS.TICKET_UPDATE_OWN) &&
      ticket.status === "OPEN";
    if (!isOwnerEdit) {
      assertPermission(user, PERMISSIONS.TICKET_UPDATE);
    }
    if (dto.categoryId) await this.assertCategoryExists(dto.categoryId);

    const updated = await this.prisma.ticket.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId ?? null } : {}),
      },
      include: ticketInclude,
    });
    await this.addHistory(id, user.id, "UPDATED");
    await this.audit.record({ actorId: user.id, action: AUDIT_ACTIONS.TICKET_UPDATED, entityType: "Ticket", entityId: id });
    return updated;
  }

  // ── Status transitions ───────────────────────────────────────

  async changeStatus(user: RequestUser, id: string, dto: StatusDto) {
    const ticket = await this.assertCanViewById(user, id);
    const from = ticket.status as TicketStatus;
    const to = dto.status;

    const allowedByMachine = TICKET_TRANSITIONS[from]?.includes(to) ?? false;
    if (!allowedByMachine) {
      throw new ForbiddenException(`Transition ${from} → ${to} is not allowed`);
    }

    // Who may perform this transition?
    const isAgent = user.permissions.includes(PERMISSIONS.TICKET_UPDATE);
    const isAssignee = ticket.assigneeId === user.id;
    const isRequester = ticket.requesterId === user.id;

    const requesterAllowed =
      isRequester &&
      user.permissions.includes(PERMISSIONS.TICKET_RESOLVE_OWN) &&
      // requester may close a resolved ticket (confirmation) or cancel an open one
      ((from === "RESOLVED" && to === "CLOSED") || (from === "OPEN" && to === "CLOSED"));
    const agentAllowed = isAgent && (isAssignee || this.canViewAll(user) || user.permissions.includes(PERMISSIONS.TICKET_ASSIGN));

    if (!requesterAllowed && !agentAllowed) {
      throw new ForbiddenException("You cannot change this ticket's status");
    }

    const now = new Date();
    const updated = await this.prisma.ticket.update({
      where: { id },
      data: {
        status: to,
        ...(to === "RESOLVED" ? { resolvedAt: now } : {}),
        ...(to === "CLOSED" ? { closedAt: now, ...(ticket.resolvedAt ? {} : { resolvedAt: now }) } : {}),
        ...(to === "IN_PROGRESS" && from === "RESOLVED" ? { resolvedAt: null, closedAt: null } : {}),
      },
      include: ticketInclude,
    });

    await this.addHistory(id, user.id, "STATUS_CHANGED", `${from} → ${to}${dto.note ? `: ${dto.note}` : ""}`);
    await this.audit.record({
      actorId: user.id,
      action: to === "RESOLVED" ? AUDIT_ACTIONS.TICKET_RESOLVED : AUDIT_ACTIONS.TICKET_STATUS_CHANGED,
      entityType: "Ticket",
      entityId: id,
      detail: { from, to },
    });

    const watchers = [ticket.requesterId, ticket.assigneeId].filter((x): x is string => !!x && x !== user.id);
    await this.jobs.enqueueNotification({
      userIds: watchers,
      type: NOTIFICATION_TYPES.TICKET_STATUS_CHANGED,
      title: `Ticket ${to.toLowerCase().replace("_", " ")}`,
      body: `Ticket "${ticket.title}" moved ${from} → ${to}`,
      ticketId: id,
    });
    return updated;
  }

  // ── Priority ─────────────────────────────────────────────────

  async changePriority(user: RequestUser, id: string, dto: PriorityDto) {
    const ticket = await this.assertCanViewById(user, id);
    assertPermission(user, PERMISSIONS.TICKET_UPDATE);

    const deadlines = await this.sla.computeDeadlines(ticket.categoryId, dto.priority, ticket.createdAt);
    const updated = await this.prisma.ticket.update({
      where: { id },
      data: {
        priority: dto.priority,
        slaFirstResponseDueAt: deadlines.firstResponseDueAt,
        slaResolutionDueAt: deadlines.resolutionDueAt,
      },
      include: ticketInclude,
    });
    await this.addHistory(id, user.id, "PRIORITY_CHANGED", `${ticket.priority} → ${dto.priority}`);
    await this.audit.record({ actorId: user.id, action: AUDIT_ACTIONS.TICKET_UPDATED, entityType: "Ticket", entityId: id, detail: { priority: dto.priority } });
    return updated;
  }

  // ── Assignment ───────────────────────────────────────────────

  async assign(user: RequestUser, id: string, dto: AssignDto) {
    await this.assertCanViewById(user, id);
    assertPermission(user, PERMISSIONS.TICKET_ASSIGN);

    let assigneeId: string | null = null;
    if (dto.assigneeId) {
      const assignee = await this.prisma.user.findUnique({ where: { id: dto.assigneeId }, include: { role: true } });
      if (!assignee || !assignee.isActive) throw new NotFoundException("Assignee not found or inactive");
      if (assignee.role.name !== ROLES.IT_SUPPORT && assignee.role.name !== ROLES.ADMIN) {
        throw new ForbiddenException("Tickets can only be assigned to IT support staff");
      }
      assigneeId = assignee.id;
    }

    const ticket = await this.prisma.ticket.findUnique({ where: { id } });
    const updated = await this.prisma.ticket.update({
      where: { id },
      data: {
        assigneeId,
        // OPEN → ASSIGNED when someone picks it up; back to IN_PROGRESS allowed below
        ...(assigneeId && ticket?.status === "OPEN" ? { status: "ASSIGNED" } : {}),
      },
      include: ticketInclude,
    });

    await this.addHistory(id, user.id, "ASSIGNED", assigneeId ? `assigned to ${updated.assignee?.name}` : "unassigned");
    await this.audit.record({ actorId: user.id, action: AUDIT_ACTIONS.TICKET_ASSIGNED, entityType: "Ticket", entityId: id, detail: { assigneeId } });

    if (assigneeId && assigneeId !== user.id) {
      await this.jobs.enqueueNotification({
        userIds: [assigneeId],
        type: NOTIFICATION_TYPES.TICKET_ASSIGNED,
        title: "Ticket assigned to you",
        body: `You have been assigned ticket "${updated.title}"`,
        ticketId: id,
      });
    }
    return updated;
  }

  // ── Comments ─────────────────────────────────────────────────

  async addComment(user: RequestUser, ticketId: string, dto: CommentDto) {
    const ticket = await this.assertCanViewById(user, ticketId);
    const isAgent = user.permissions.includes(PERMISSIONS.TICKET_UPDATE);
    const canComment = isAgent || (ticket.requesterId === user.id && user.permissions.includes(PERMISSIONS.TICKET_COMMENT_OWN));
    if (!canComment) throw new ForbiddenException("You cannot comment on this ticket");
    // Only agents may write internal notes.
    const isInternal = isAgent ? (dto.isInternal ?? false) : false;

    const comment = await this.prisma.ticketComment.create({
      data: { ticketId, authorId: user.id, body: dto.body, isInternal },
      include: { author: { select: { id: true, name: true, email: true } } },
    });
    await this.addHistory(ticketId, user.id, "COMMENTED", isInternal ? "internal note" : "comment");
    await this.audit.record({ actorId: user.id, action: AUDIT_ACTIONS.TICKET_UPDATED, entityType: "Ticket", entityId: ticketId, detail: "comment" });

    const watchers = [ticket.requesterId, ticket.assigneeId].filter((x): x is string => !!x && x !== user.id);
    await this.jobs.enqueueNotification({
      // Internal notes never notify the requester — agent watchers only.
      userIds: isInternal ? watchers.filter((wid) => wid !== ticket.requesterId) : watchers,
      type: NOTIFICATION_TYPES.TICKET_COMMENTED,
      title: isInternal ? "Internal note added" : "New comment",
      body: isInternal ? `Internal note added on "${ticket.title}"` : `${user.name} commented on "${ticket.title}"`,
      ticketId,
    });
    return comment;
  }

  // ── Delete (admin) ───────────────────────────────────────────

  async remove(user: RequestUser, id: string) {
    assertPermission(user, PERMISSIONS.TICKET_DELETE);
    await this.getTicketOr404(id);
    await this.prisma.ticket.delete({ where: { id } });
    await this.audit.record({ actorId: user.id, action: AUDIT_ACTIONS.TICKET_DELETED, entityType: "Ticket", entityId: id });
    return { success: true };
  }

  // ── Helpers ──────────────────────────────────────────────────

  private async addHistory(ticketId: string, actorId: string | null, action: string, detail?: string): Promise<void> {
    await this.prisma.ticketHistory.create({ data: { ticketId, actorId, action, detail } });
  }

  private async assertCategoryExists(categoryId: string): Promise<void> {
    const cat = await this.prisma.category.findUnique({ where: { id: categoryId }, select: { id: true } });
    if (!cat) throw new NotFoundException("Category not found");
  }
}
