import { randomUUID } from "node:crypto";
import type { Request, Response, NextFunction } from "express";

/** Attaches a request id (from header or generated) for tracing and audit logs. */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers["x-request-id"];
  const id = typeof incoming === "string" && incoming.length <= 128 ? incoming : randomUUID();
  req.requestId = id;
  res.setHeader("x-request-id", id);
  next();
}
