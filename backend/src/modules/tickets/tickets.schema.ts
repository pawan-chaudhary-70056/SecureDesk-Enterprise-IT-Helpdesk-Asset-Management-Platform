import { z } from "zod";
import { TICKET_PRIORITIES, TICKET_STATUSES } from "../../common/constants";

export const createTicketSchema = z.object({
  title: z.string().trim().min(5).max(200),
  description: z.string().trim().min(10).max(10_000),
  categoryId: z.string().min(1).nullish(),
  priority: z.enum(TICKET_PRIORITIES).default("MEDIUM"),
});

export const updateTicketSchema = z.object({
  title: z.string().trim().min(5).max(200).optional(),
  description: z.string().trim().min(10).max(10_000).optional(),
  categoryId: z.string().min(1).nullish(),
});

export const statusSchema = z.object({
  status: z.enum(TICKET_STATUSES),
  note: z.string().trim().max(2_000).optional(),
});

export const prioritySchema = z.object({
  priority: z.enum(TICKET_PRIORITIES),
});

export const assignSchema = z.object({
  assigneeId: z.string().min(1).nullish(), // null = unassign
});

export const commentSchema = z.object({
  body: z.string().trim().min(1).max(5_000),
  isInternal: z.boolean().optional().default(false),
});

export const listQuerySchema = z.object({
  status: z.enum(TICKET_STATUSES).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  q: z.string().max(200).optional(),
  categoryId: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export type CreateTicketDto = z.infer<typeof createTicketSchema>;
export type UpdateTicketDto = z.infer<typeof updateTicketSchema>;
export type StatusDto = z.infer<typeof statusSchema>;
export type PriorityDto = z.infer<typeof prioritySchema>;
export type AssignDto = z.infer<typeof assignSchema>;
export type CommentDto = z.infer<typeof commentSchema>;
export type ListQueryDto = z.infer<typeof listQuerySchema>;
