import { logger } from "../common/middleware/http-logger.middleware";

export type JobName = "notification" | "sla-scan" | "report";

export interface NotificationJobData {
  kind: "notify";
  userIds: string[];
  type: string;
  title: string;
  body: string;
  ticketId?: string;
}

export type JobData = NotificationJobData;

export interface QueueAdapter {
  add(name: JobName, data: JobData): Promise<void>;
  /** Registers the handler executed for each job. */
  process(handler: (name: JobName, data: JobData) => Promise<void>): void;
  /** Registers recurring work (SLA scans) on an interval. */
  startScheduler?(fn: () => void | Promise<void>, intervalMs: number): void;
  close(): Promise<void>;
}

const MAX_ATTEMPTS = 3;

/** In-process queue: executes jobs asynchronously with retries. Good for dev/test. */
class InlineQueue implements QueueAdapter {
  private handler: ((name: JobName, data: JobData) => Promise<void>) | null = null;
  private schedulerTimer: NodeJS.Timeout | null = null;

  async add(name: JobName, data: JobData): Promise<void> {
    if (!this.handler) {
      logger.error({ event: "job.dropped", reason: "no handler registered", name });
      return;
    }
    setImmediate(() => this.runWithRetry(name, data));
  }

  process(handler: (name: JobName, data: JobData) => Promise<void>): void {
    this.handler = handler;
  }

  startScheduler(fn: () => void | Promise<void>, intervalMs: number): void {
    if (this.schedulerTimer) return;
    this.schedulerTimer = setInterval(() => {
      void Promise.resolve(fn()).catch((err: unknown) => logger.error({ event: "job.sla_scan_failed", err: String(err) }));
    }, intervalMs);
    this.schedulerTimer.unref();
  }

  private async runWithRetry(name: JobName, data: JobData): Promise<void> {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        await this.handler?.(name, data);
        return;
      } catch (err) {
        logger.error({ event: "job.failed", name, attempt, err: String(err) });
        if (attempt === MAX_ATTEMPTS) return;
        await new Promise((r) => setTimeout(r, 250 * 2 ** attempt));
      }
    }
  }

  async close(): Promise<void> {
    if (this.schedulerTimer) clearInterval(this.schedulerTimer);
  }
}

/** BullMQ-backed queue used when REDIS_URL is configured. */
class BullMqQueue implements QueueAdapter {
  private worker: import("bullmq").Worker<JobData> | null = null;
  private schedulerTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly connection: { url: string },
    private readonly QueueCtor: typeof import("bullmq").Queue,
    private readonly WorkerCtor: typeof import("bullmq").Worker,
  ) {}

  private async queue(): Promise<import("bullmq").Queue<JobData>> {
    return new this.QueueCtor("securedesk", { connection: this.connection });
  }

  async add(name: JobName, data: JobData): Promise<void> {
    const q = await this.queue();
    await q.add(name, data, { attempts: MAX_ATTEMPTS, backoff: { type: "exponential", delay: 500 } });
    await q.close();
  }

  process(handler: (name: JobName, data: JobData) => Promise<void>): void {
    this.worker = new this.WorkerCtor(
      "securedesk",
      async (job) => handler(job.name as JobName, job.data),
      { connection: this.connection },
    );
  }

  /**
   * BullMQ repeatable jobs need scheduler bookkeeping across restarts; a local
   * timer gives the same business behavior without that operational overhead.
   */
  startScheduler(fn: () => void | Promise<void>, intervalMs: number): void {
    if (this.schedulerTimer) return;
    this.schedulerTimer = setInterval(() => {
      void Promise.resolve(fn()).catch((err: unknown) => logger.error({ event: "job.sla_scan_failed", err: String(err) }));
    }, intervalMs);
    this.schedulerTimer.unref();
  }

  async close(): Promise<void> {
    if (this.schedulerTimer) clearInterval(this.schedulerTimer);
    await this.worker?.close();
  }
}

export async function createQueue(): Promise<QueueAdapter> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    logger.info({ event: "queue.mode", mode: "inline" });
    return new InlineQueue();
  }
  try {
    const bullmq = await import("bullmq");
    logger.info({ event: "queue.mode", mode: "bullmq" });
    return new BullMqQueue({ url: redisUrl }, bullmq.Queue, bullmq.Worker);
  } catch (err) {
    logger.error({ event: "queue.bullmq_unavailable", err: String(err) });
    logger.info({ event: "queue.mode", mode: "inline (fallback)" });
    return new InlineQueue();
  }
}
