import { api } from "./client";
import type { Paginated, Ticket, TicketDetail } from "@/types";

export interface TicketListParams {
  status?: string;
  priority?: string;
  q?: string;
  categoryId?: string;
  page?: number;
  pageSize?: number;
}

export async function fetchTickets(params: TicketListParams = {}): Promise<Paginated<Ticket>> {
  const r = await api.get<Paginated<Ticket>>("/tickets", { params });
  return r.data;
}

export async function fetchTicket(id: string): Promise<TicketDetail> {
  const r = await api.get<TicketDetail>(`/tickets/${id}`);
  return r.data;
}

export async function createTicket(dto: { title: string; description: string; categoryId?: string | null; priority: string }): Promise<Ticket> {
  const r = await api.post<Ticket>("/tickets", dto);
  return r.data;
}

export async function updateTicket(id: string, dto: { title?: string; description?: string; categoryId?: string | null }): Promise<Ticket> {
  const r = await api.patch<Ticket>(`/tickets/${id}`, dto);
  return r.data;
}

export async function changeTicketStatus(id: string, status: string, note?: string): Promise<Ticket> {
  const r = await api.patch<Ticket>(`/tickets/${id}/status`, { status, ...(note ? { note } : {}) });
  return r.data;
}

export async function changeTicketPriority(id: string, priority: string): Promise<Ticket> {
  const r = await api.patch<Ticket>(`/tickets/${id}/priority`, { priority });
  return r.data;
}

export async function assignTicket(id: string, assigneeId: string | null): Promise<Ticket> {
  const r = await api.post<Ticket>(`/tickets/${id}/assign`, { assigneeId });
  return r.data;
}

export async function addTicketComment(id: string, body: string, isInternal = false): Promise<void> {
  await api.post(`/tickets/${id}/comments`, { body, isInternal });
}

export async function uploadTicketAttachment(ticketId: string, file: File): Promise<void> {
  const form = new FormData();
  form.append("file", file);
  await api.post(`/tickets/${ticketId}/attachments`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
}

export function attachmentDownloadUrl(ticketId: string, attachmentId: string): string {
  const base = (import.meta.env.VITE_API_URL as string | undefined) ?? "/api/v1";
  return `${base}/tickets/${ticketId}/attachments/${attachmentId}`;
}
