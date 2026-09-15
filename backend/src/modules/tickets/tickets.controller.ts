import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { randomUUID } from "node:crypto";
import { mkdirSync, createReadStream, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { JwtAuthGuard, PermissionsGuard, RequirePermissions } from "../../common/guards/auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { RequestUser } from "../../common/guards/auth.guard";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { PrismaService } from "../../database/prisma.service";
import {
  assignSchema,
  commentSchema,
  createTicketSchema,
  listQuerySchema,
  prioritySchema,
  statusSchema,
  updateTicketSchema,
} from "./tickets.schema";
import { TicketsService } from "./tickets.service";

@Controller("tickets")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TicketsController {
  private readonly uploadDir: string;
  private readonly maxBytes: number;
  private readonly allowedExt = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".pdf", ".txt", ".csv", ".log", ".zip", ".doc", ".docx", ".xls", ".xlsx"]);

  constructor(
    private readonly tickets: TicketsService,
    private readonly prisma: PrismaService,
  ) {
    this.uploadDir = resolve(process.env.UPLOAD_DIR ?? "./uploads");
    mkdirSync(this.uploadDir, { recursive: true });
    this.maxBytes = Number(process.env.MAX_UPLOAD_MB ?? 10) * 1024 * 1024;
  }

  @Post()
  @RequirePermissions("ticket:create")
  create(@CurrentUser() user: RequestUser, @Body(new ZodValidationPipe(createTicketSchema)) dto: unknown) {
    return this.tickets.create(user, dto as never);
  }

  @Get()
  @RequirePermissions("ticket:read:own", "ticket:read:assigned", "ticket:read:team", "ticket:read:all")
  list(@CurrentUser() user: RequestUser, @Query(new ZodValidationPipe(listQuerySchema)) query: unknown) {
    return this.tickets.list(user, query as never);
  }

  @Get(":id")
  @RequirePermissions("ticket:read:own", "ticket:read:assigned", "ticket:read:team", "ticket:read:all")
  getById(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.tickets.getById(user, id);
  }

  @Patch(":id")
  @RequirePermissions("ticket:update", "ticket:update:own")
  update(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body(new ZodValidationPipe(updateTicketSchema)) dto: unknown) {
    return this.tickets.update(user, id, dto as never);
  }

  @Patch(":id/status")
  @RequirePermissions("ticket:update", "ticket:resolve", "ticket:resolve:own")
  changeStatus(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body(new ZodValidationPipe(statusSchema)) dto: unknown) {
    return this.tickets.changeStatus(user, id, dto as never);
  }

  @Patch(":id/priority")
  @RequirePermissions("ticket:update")
  changePriority(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body(new ZodValidationPipe(prioritySchema)) dto: unknown) {
    return this.tickets.changePriority(user, id, dto as never);
  }

  @Post(":id/assign")
  @RequirePermissions("ticket:assign")
  assign(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body(new ZodValidationPipe(assignSchema)) dto: unknown) {
    return this.tickets.assign(user, id, dto as never);
  }

  @Post(":id/comments")
  @RequirePermissions("ticket:comment", "ticket:comment:own")
  addComment(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body(new ZodValidationPipe(commentSchema)) dto: unknown) {
    return this.tickets.addComment(user, id, dto as never);
  }

  // ── Attachments ──────────────────────────────────────────────

  @Post(":id/attachments")
  @RequirePermissions("ticket:comment", "ticket:comment:own")
  // Enforce the byte limit at the multer layer too — rejection happens before
  // the whole file is buffered into memory.
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: Number(process.env.MAX_UPLOAD_MB ?? 10) * 1024 * 1024 } }))
  async uploadAttachment(
    @CurrentUser() user: RequestUser,
    @Param("id") ticketId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    await this.tickets.getById(user, ticketId); // object-level check via service
    if (!file) throw new BadRequestException("No file provided");
    if (file.size > this.maxBytes) throw new BadRequestException("File too large");
    const ext = extname(file.originalname).toLowerCase();
    if (!this.allowedExt.has(ext)) throw new BadRequestException("File type not allowed");

    const storedName = `${randomUUID()}${ext}`;
    const { writeFile } = await import("node:fs/promises");
    await writeFile(join(this.uploadDir, storedName), file.buffer);

    const attachment = await this.prisma.ticketAttachment.create({
      data: {
        ticketId,
        uploaderId: user.id,
        filename: file.originalname.slice(0, 255),
        storedName,
        mimeType: file.mimetype.slice(0, 255),
        sizeBytes: file.size,
      },
    });
    return attachment;
  }

  @Get(":id/attachments/:attachmentId")
  @RequirePermissions("ticket:read:own", "ticket:read:assigned", "ticket:read:team", "ticket:read:all")
  async downloadAttachment(
    @CurrentUser() user: RequestUser,
    @Param("id") ticketId: string,
    @Param("attachmentId") attachmentId: string,
    @Res() res: Response,
  ) {
    await this.tickets.getById(user, ticketId); // object-level check
    const attachment = await this.prisma.ticketAttachment.findFirst({ where: { id: attachmentId, ticketId } });
    if (!attachment) throw new BadRequestException("Attachment not found");
    const path = join(this.uploadDir, attachment.storedName);
    try {
      statSync(path);
    } catch {
      throw new BadRequestException("File missing from storage");
    }
    res.setHeader("Content-Type", attachment.mimeType);
    res.setHeader("Content-Disposition", `attachment; filename="${attachment.filename.replace(/"/g, "")}"`);
    createReadStream(path).pipe(res);
  }

  @Delete(":id")
  @RequirePermissions("ticket:delete")
  remove(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.tickets.remove(user, id);
  }
}
