import { Controller, Get } from "@nestjs/common";
import { Public } from "../common/guards/auth.guard";
import { PrismaService } from "../database/prisma.service";

/**
 * Health endpoints (spec §22). Readiness verifies the database connection;
 * /health stays dependency-free for liveness probes.
 */
@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  health() {
    return { status: "ok", uptime: process.uptime(), timestamp: new Date().toISOString() };
  }

  @Public()
  @Get("live")
  live() {
    return { status: "ok" };
  }

  @Public()
  @Get("ready")
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: "ok", database: "up" };
    } catch {
      return { status: "degraded", database: "down" };
    }
  }
}
