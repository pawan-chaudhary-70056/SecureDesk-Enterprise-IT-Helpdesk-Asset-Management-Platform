import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { Request, Response } from "express";

/**
 * Centralized error filter. Produces the spec's error envelope and never leaks
 * stack traces, SQL errors, or infrastructure details in production. Known
 * Prisma errors are translated into meaningful HTTP statuses (409/404) instead
 * of an opaque 500.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger("Exceptions");

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = "INTERNAL_ERROR";
    let message = "Internal server error";

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === "string") {
        message = body;
      } else if (body && typeof body === "object") {
        const b = body as Record<string, unknown>;
        message = typeof b.message === "string" ? b.message : Array.isArray(b.message) ? b.message.join("; ") : message;
        code = typeof b.code === "string" ? b.code : defaultCode(status);
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const mapped = prismaErrorToHttp(exception);
      status = mapped.status;
      code = mapped.code;
      message = mapped.message;
      this.logger.error(`Prisma error ${exception.code} on ${req.method} ${req.originalUrl}: ${exception.message}`);
    } else {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    }

    res.status(status).json({
      success: false,
      error: {
        code,
        message,
        requestId: req.requestId,
      },
    });
  }
}

/** Translate well-known Prisma request errors into HTTP semantics. */
function prismaErrorToHttp(err: Prisma.PrismaClientKnownRequestError): { status: number; code: string; message: string } {
  switch (err.code) {
    case "P2002":
      return { status: HttpStatus.CONFLICT, code: "CONFLICT", message: "A record with these unique values already exists" };
    case "P2025":
      return { status: HttpStatus.NOT_FOUND, code: "NOT_FOUND", message: "Record not found" };
    case "P2003":
      return { status: HttpStatus.CONFLICT, code: "CONFLICT", message: "Operation violates a relation constraint" };
    default:
      return { status: HttpStatus.INTERNAL_SERVER_ERROR, code: "INTERNAL_ERROR", message: "Internal server error" };
  }
}

function defaultCode(status: number): string {
  switch (status) {
    case 400: return "VALIDATION_ERROR";
    case 401: return "UNAUTHORIZED";
    case 403: return "FORBIDDEN";
    case 404: return "NOT_FOUND";
    case 409: return "CONFLICT";
    case 429: return "TOO_MANY_REQUESTS";
    default: return "HTTP_ERROR";
  }
}
