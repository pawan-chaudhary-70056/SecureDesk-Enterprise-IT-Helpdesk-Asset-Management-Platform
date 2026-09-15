import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { createQueue, type QueueAdapter } from "./queue";
import { NotificationsService } from "../modules/notifications/notifications.service";
import { SlaService } from "../sla/sla.service";
import { logger } from "../common/middleware/http-logger.middleware";

/**
 * Background job coordinator.
 * - "notification" jobs create notifications (email + in-app).
 * - SLA scans run on a schedule (BullMQ repeatable-style or inline timer).
 */
@Injectable()
export class JobsService implements OnModuleInit, OnModuleDestroy {
  private queue: QueueAdapter | null = null;

  constructor(
    private readonly notifications: NotificationsService,
    private readonly sla: SlaService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.queue = await createQueue();
    this.queue.process(async (name, data) => {
      if (name === "notification") {
        await this.notifications.notify(data);
      }
    });
    this.queue.startScheduler?.(() => {
      void this.sla.scanAndEscalate();
    }, 60_000);
    logger.info({ event: "jobs.ready" });
  }

  async enqueueNotification(data: {
    userIds: string[];
    type: string;
    title: string;
    body: string;
    ticketId?: string;
  }): Promise<void> {
    await this.queue?.add("notification", { kind: "notify", ...data });
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close();
  }
}
