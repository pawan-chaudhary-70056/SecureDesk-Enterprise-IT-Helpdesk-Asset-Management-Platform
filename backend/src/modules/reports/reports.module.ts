import { Controller, Get, Injectable, Module, Query, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { PrismaService } from "../../database/prisma.service";
import { JwtAuthGuard, PermissionsGuard, RequirePermissions } from "../../common/guards/auth.guard";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";

const reportQuery = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private dateRange(from?: string, to?: string) {
    const gte = from ? new Date(from) : undefined;
    const lte = to ? new Date(to) : undefined;
    const valid = (d: Date | undefined) => (d && !Number.isNaN(d.getTime()) ? d : undefined);
    return { gte: valid(gte), lte: valid(lte) };
  }

  private where(from?: string, to?: string) {
    const { gte, lte } = this.dateRange(from, to);
    return { createdAt: { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) } };
  }

  async ticketVolume(from?: string, to?: string) {
    const groupByStatus = await this.prisma.ticket.groupBy({
      by: ["status"],
      _count: { _all: true },
    });
    const groupByPriority = await this.prisma.ticket.groupBy({
      by: ["priority"],
      where: this.where(from, to),
      _count: { _all: true },
    });
    const total = await this.prisma.ticket.count({ where: this.where(from, to) });
    return {
      total,
      byStatus: groupByStatus.map((g) => ({ status: g.status, count: g._count._all })),
      byPriority: groupByPriority.map((g) => ({ priority: g.priority, count: g._count._all })),
    };
  }

  async resolutionTimes() {
    const resolved = await this.prisma.ticket.findMany({
      where: { resolvedAt: { not: null } },
      select: { createdAt: true, resolvedAt: true, priority: true },
      take: 5000,
      orderBy: { resolvedAt: "desc" },
    });
    const hours = resolved
      .filter((t) => t.resolvedAt)
      .map((t) => (t.resolvedAt!.getTime() - t.createdAt.getTime()) / 3_600_000);
    hours.sort((a, b) => a - b);
    const pick = (p: number) => (hours.length ? hours[Math.min(hours.length - 1, Math.floor(hours.length * p))] : 0);
    return {
      count: hours.length,
      medianHours: pick(0.5),
      p90Hours: pick(0.9),
      averageHours: hours.length ? hours.reduce((a, b) => a + b, 0) / hours.length : 0,
    };
  }

  async slaPerformance() {
    const [total, breached, warned] = await Promise.all([
      this.prisma.ticket.count({ where: { slaResolutionDueAt: { not: null } } }),
      this.prisma.ticket.count({ where: { slaResolutionDueAt: { lt: new Date() }, status: { notIn: ["RESOLVED", "CLOSED"] } } }),
      this.prisma.ticket.count({
        where: {
          slaResolutionDueAt: {
            gte: new Date(),
            lte: new Date(Date.now() + 60 * 60_000),
          },
          status: { notIn: ["RESOLVED", "CLOSED"] },
        },
      }),
    ]);
    return { ticketsWithSla: total, currentlyBreached: breached, approachingDeadline: warned };
  }

  async assetInventory() {
    const byStatus = await this.prisma.asset.groupBy({ by: ["status"], _count: { _all: true } });
    const total = await this.prisma.asset.count();
    return { total, byStatus: byStatus.map((g) => ({ status: g.status, count: g._count._all })) };
  }
}

@Controller("reports")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions("report:read")
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get("tickets")
  tickets(@Query(new ZodValidationPipe(reportQuery)) q: { from?: string; to?: string }) {
    return this.reports.ticketVolume(q.from, q.to);
  }

  @Get("resolution-times")
  resolutionTimes() {
    return this.reports.resolutionTimes();
  }

  @Get("sla")
  sla() {
    return this.reports.slaPerformance();
  }

  @Get("assets")
  assets() {
    return this.reports.assetInventory();
  }
}

@Module({
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
