import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { logger } from "../common/middleware/http-logger.middleware";
import type { AuditAction } from "../common/constants";

export interface AuditInput {
  actorId?: string | null;
  action: AuditAction | string;
  entityType?: string;
  entityId?: string;
  detail?: Record<string, unknown> | string;
  ip?: string;
  requestId?: string;
}

/** Records business/security actions. Never store secrets here. */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: AuditInput): Promise<void> {
    const detail =
      input.detail === undefined ? null : typeof input.detail === "string" ? input.detail : JSON.stringify(input.detail);
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: input.actorId ?? null,
          action: input.action,
          entityType: input.entityType,
          entityId: input.entityId,
          detail,
          ip: input.ip,
          requestId: input.requestId,
        },
      });
    } catch (err) {
      logger.error({ event: "audit.write_failed", err: String(err) });
    }
  }
}
