import { Controller, Get, Module, Query, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { PrismaService } from "../../database/prisma.service";
import { JwtAuthGuard, PermissionsGuard, RequirePermissions } from "../../common/guards/auth.guard";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";

const listQuery = z.object({
  action: z.string().max(120).optional(),
  actorId: z.string().max(120).optional(),
  entityType: z.string().max(120).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(50),
});

const securityQuery = z.object({
  type: z.string().max(120).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(50),
});

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("audit")
  @RequirePermissions("audit:read")
  async auditLogs(@Query(new ZodValidationPipe(listQuery)) q: { action?: string; actorId?: string; entityType?: string; page: number; pageSize: number }) {
    const where = {
      ...(q.action ? { action: q.action } : {}),
      ...(q.actorId ? { actorId: q.actorId } : {}),
      ...(q.entityType ? { entityType: q.entityType } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        include: { actor: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  }

  @Get("security")
  @RequirePermissions("security:manage", "audit:read")
  async securityEvents(@Query(new ZodValidationPipe(securityQuery)) q: { type?: string; page: number; pageSize: number }) {
    const where = { ...(q.type ? { type: q.type } : {}) };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.securityEvent.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.securityEvent.count({ where }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  }
}

@Module({
  controllers: [AuditController],
})
export class AuditReadModule {}
