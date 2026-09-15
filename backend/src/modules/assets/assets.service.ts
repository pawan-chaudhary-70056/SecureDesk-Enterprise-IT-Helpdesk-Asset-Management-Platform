import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import { AuditService } from "../../audit/audit.service";
import { JobsService } from "../../jobs/jobs.service";
import { assertPermission, type RequestUser } from "../../common/guards/auth.guard";
import { ASSET_TRANSITIONS, AUDIT_ACTIONS, NOTIFICATION_TYPES, PERMISSIONS, type AssetStatus } from "../../common/constants";
import type { AssignAssetDto, CreateAssetDto, ListAssetsQueryDto, UpdateAssetDto } from "./assets.schema";

const assetInclude = {
  category: { select: { id: true, name: true } },
  assignedTo: { select: { id: true, name: true, email: true } },
} as const;

function toDate(value?: string): Date | null {
  return value ? new Date(value) : null;
}

/**
 * Asset lifecycle management. Transitions are validated against the state
 * machine and authorization is enforced server-side on every operation.
 */
@Injectable()
export class AssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly jobs: JobsService,
  ) {}

  async list(user: RequestUser, q: ListAssetsQueryDto) {
    const canReadAll = user.permissions.includes(PERMISSIONS.ASSET_READ_ALL);
    const where = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.categoryId ? { categoryId: q.categoryId } : {}),
      ...(q.q ? { OR: [{ assetTag: { contains: q.q } }, { name: { contains: q.q } }, { serialNumber: { contains: q.q } }] } : {}),
      // Employees may only ever list their own assigned assets.
      ...(!canReadAll ? { assignedToId: user.id } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.asset.findMany({ where, include: assetInclude, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      this.prisma.asset.count({ where }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  }

  async getById(user: RequestUser, id: string) {
    const asset = await this.prisma.asset.findUnique({ where: { id }, include: assetInclude });
    if (!asset) throw new NotFoundException("Asset not found");
    const canReadAll = user.permissions.includes(PERMISSIONS.ASSET_READ_ALL);
    if (!canReadAll && asset.assignedToId !== user.id) {
      throw new ForbiddenException("You do not have access to this asset");
    }
    const history = await this.prisma.assetHistory.findMany({
      where: { assetId: id },
      include: { actor: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    });
    const assignments = canReadAll
      ? await this.prisma.assetAssignment.findMany({
          where: { assetId: id },
          include: { user: { select: { id: true, name: true, email: true } } },
          orderBy: { assignedAt: "desc" },
        })
      : [];
    return { ...asset, history, assignments };
  }

  async create(user: RequestUser, dto: CreateAssetDto) {
    assertPermission(user, PERMISSIONS.ASSET_MANAGE);
    const exists = await this.prisma.asset.findUnique({ where: { assetTag: dto.assetTag } });
    if (exists) throw new ForbiddenException("Asset tag already exists");

    const asset = await this.prisma.asset.create({
      data: {
        assetTag: dto.assetTag,
        name: dto.name,
        serialNumber: dto.serialNumber,
        categoryId: dto.categoryId ?? null,
        location: dto.location,
        purchasedAt: toDate(dto.purchasedAt),
        warrantyUntil: toDate(dto.warrantyUntil),
        history: { create: { actorId: user.id, action: "REGISTERED" } },
      },
      include: assetInclude,
    });
    await this.audit.record({ actorId: user.id, action: AUDIT_ACTIONS.ASSET_REGISTERED, entityType: "Asset", entityId: asset.id, detail: { tag: asset.assetTag } });
    return asset;
  }

  async update(user: RequestUser, id: string, dto: UpdateAssetDto) {
    assertPermission(user, PERMISSIONS.ASSET_MANAGE);
    const asset = await this.prisma.asset.findUnique({ where: { id } });
    if (!asset) throw new NotFoundException("Asset not found");

    // Status changes must follow the lifecycle machine.
    if (dto.status && dto.status !== asset.status) {
      this.assertTransition(asset.status as AssetStatus, dto.status);
      // Direct status edits bypass assignment bookkeeping — guard the sensitive ones.
      if (dto.status === "ASSIGNED" || asset.status === "ASSIGNED") {
        throw new ForbiddenException("Use /assign or /return to change assignment status");
      }
    }

    const updated = await this.prisma.asset.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.serialNumber !== undefined ? { serialNumber: dto.serialNumber } : {}),
        ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId ?? null } : {}),
        ...(dto.location !== undefined ? { location: dto.location } : {}),
        ...(dto.purchasedAt !== undefined ? { purchasedAt: toDate(dto.purchasedAt) } : {}),
        ...(dto.warrantyUntil !== undefined ? { warrantyUntil: toDate(dto.warrantyUntil) } : {}),
        ...(dto.status !== undefined && dto.status !== asset.status ? { status: dto.status } : {}),
      },
      include: assetInclude,
    });

    if (dto.status && dto.status !== asset.status) {
      const action =
        dto.status === "MAINTENANCE" ? "MAINTENANCE_STARTED" : dto.status === "RETIRED" ? "RETIRED" : dto.status;
      await this.prisma.assetHistory.create({ data: { assetId: id, actorId: user.id, action } });
      if (dto.status === "RETIRED") await this.audit.record({ actorId: user.id, action: AUDIT_ACTIONS.ASSET_RETIRED, entityType: "Asset", entityId: id });
    }
    return updated;
  }

  async assign(user: RequestUser, id: string, dto: AssignAssetDto) {
    assertPermission(user, PERMISSIONS.ASSET_MANAGE);
    const asset = await this.prisma.asset.findUnique({ where: { id } });
    if (!asset) throw new NotFoundException("Asset not found");
    this.assertTransition(asset.status as AssetStatus, "ASSIGNED");

    const target = await this.prisma.user.findUnique({ where: { id: dto.userId } });
    if (!target || !target.isActive) throw new NotFoundException("Target user not found or inactive");

    const updated = await this.prisma.$transaction(async (tx) => {
      const a = await tx.asset.update({
        where: { id },
        data: { status: "ASSIGNED", assignedToId: dto.userId },
        include: assetInclude,
      });
      await tx.assetAssignment.create({
        data: { assetId: id, userId: dto.userId, assignedById: user.id, notes: dto.notes },
      });
      await tx.assetHistory.create({ data: { assetId: id, actorId: user.id, action: "ASSIGNED", detail: `to ${target.email}` } });
      return a;
    });

    await this.audit.record({ actorId: user.id, action: AUDIT_ACTIONS.ASSET_ASSIGNED, entityType: "Asset", entityId: id, detail: { userId: dto.userId } });
    await this.jobs.enqueueNotification({
      userIds: [dto.userId],
      type: NOTIFICATION_TYPES.ASSET_ASSIGNED,
      title: "Asset assigned to you",
      body: `${asset.name} (${asset.assetTag}) has been assigned to you`,
    });
    return updated;
  }

  async return(user: RequestUser, id: string, notes?: string) {
    assertPermission(user, PERMISSIONS.ASSET_MANAGE);
    const asset = await this.prisma.asset.findUnique({ where: { id } });
    if (!asset) throw new NotFoundException("Asset not found");
    this.assertTransition(asset.status as AssetStatus, "RETURNED");
    if (!asset.assignedToId) throw new ForbiddenException("Asset is not currently assigned");

    const updated = await this.prisma.$transaction(async (tx) => {
      const a = await tx.asset.update({
        where: { id },
        data: { status: "RETURNED", assignedToId: null },
        include: assetInclude,
      });
      await tx.assetAssignment.updateMany({
        where: { assetId: id, returnedAt: null },
        data: { returnedAt: new Date(), ...(notes !== undefined ? { notes } : {}) },
      });
      await tx.assetHistory.create({ data: { assetId: id, actorId: user.id, action: "RETURNED" } });
      return a;
    });

    await this.audit.record({ actorId: user.id, action: AUDIT_ACTIONS.ASSET_RETURNED, entityType: "Asset", entityId: id });
    return updated;
  }

  async maintenance(user: RequestUser, id: string, end: boolean) {
    assertPermission(user, PERMISSIONS.ASSET_MANAGE);
    const asset = await this.prisma.asset.findUnique({ where: { id } });
    if (!asset) throw new NotFoundException("Asset not found");
    const target: AssetStatus = end ? "AVAILABLE" : "MAINTENANCE";
    this.assertTransition(asset.status as AssetStatus, target);
    if (!end && asset.assignedToId) throw new ForbiddenException("Return the asset before sending it to maintenance");

    const updated = await this.prisma.asset.update({ where: { id }, data: { status: target }, include: assetInclude });
    await this.prisma.assetHistory.create({
      data: { assetId: id, actorId: user.id, action: end ? "MAINTENANCE_ENDED" : "MAINTENANCE_STARTED" },
    });
    return updated;
  }

  async retire(user: RequestUser, id: string) {
    assertPermission(user, PERMISSIONS.ASSET_MANAGE);
    const asset = await this.prisma.asset.findUnique({ where: { id } });
    if (!asset) throw new NotFoundException("Asset not found");
    this.assertTransition(asset.status as AssetStatus, "RETIRED");

    const updated = await this.prisma.asset.update({ where: { id }, data: { status: "RETIRED" }, include: assetInclude });
    await this.prisma.assetHistory.create({ data: { assetId: id, actorId: user.id, action: "RETIRED" } });
    await this.audit.record({ actorId: user.id, action: AUDIT_ACTIONS.ASSET_RETIRED, entityType: "Asset", entityId: id });
    return updated;
  }

  private assertTransition(from: AssetStatus, to: AssetStatus): void {
    const allowed = ASSET_TRANSITIONS[from]?.includes(to) ?? false;
    if (!allowed) throw new ForbiddenException(`Asset transition ${from} → ${to} is not allowed`);
  }
}
