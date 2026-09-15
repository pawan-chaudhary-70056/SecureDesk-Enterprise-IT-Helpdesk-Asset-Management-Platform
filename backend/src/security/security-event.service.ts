import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { logger } from "../common/middleware/http-logger.middleware";
import type { SecurityEventType } from "../common/constants";

export interface SecurityEventInput {
  type: SecurityEventType | string;
  userId?: string | null;
  email?: string | null;
  detail?: string;
  ip?: string;
  requestId?: string;
}

/** Records security-relevant events (auth failures, token reuse, rate limits). */
@Injectable()
export class SecurityEventService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: SecurityEventInput): Promise<void> {
    try {
      await this.prisma.securityEvent.create({ data: { ...input, userId: input.userId ?? null, email: input.email ?? null } });
    } catch (err) {
      logger.error({ event: "security_event.write_failed", err: String(err) });
    }
    logger.warn({ event: "security.event", ...input });
  }
}
