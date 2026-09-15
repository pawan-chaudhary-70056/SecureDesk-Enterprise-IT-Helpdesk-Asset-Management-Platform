import type { Request } from "express";
import { Logger } from "@nestjs/common";
import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
});

const nestLogger = new Logger("Http");

/** Structured request logging with requestId and duration; never logs tokens. */
export function httpLoggerMiddleware(req: Request, res: { statusCode: number; on: (ev: string, cb: () => void) => void }, next: () => void): void {
  const start = Date.now();
  res.on("finish", () => {
    const durationMs = Date.now() - start;
    logger.info({
      event: "http.request",
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl,
      userId: req.user?.id,
      status: res.statusCode,
      durationMs,
    });
    if (process.env.NODE_ENV !== "production") {
      nestLogger.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs}ms`);
    }
  });
  next();
}
