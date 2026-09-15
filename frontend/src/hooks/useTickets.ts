import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchTickets,
  fetchTicket,
  createTicket,
  changeTicketStatus,
  changeTicketPriority,
  assignTicket,
  addTicketComment,
  uploadTicketAttachment,
  type TicketListParams,
} from "@/api/tickets";

export const ticketKeys = {
  all: ["tickets"] as const,
  list: (params: Record<string, unknown>) => ["tickets", "list", params] as const,
  detail: (id: string) => ["tickets", "detail", id] as const,
};

export function useTickets(params: TicketListParams) {
  return useQuery({
    queryKey: ticketKeys.list(params as Record<string, unknown>),
    queryFn: () => fetchTickets(params),
  });
}

export function useTicket(id: string) {
  return useQuery({
    queryKey: ticketKeys.detail(id),
    queryFn: () => fetchTicket(id),
    enabled: !!id,
  });
}

/** Mutations invalidate both list and detail caches. */
export function useTicketMutations(id?: string) {
  const qc = useQueryClient();
  const invalidate = async () => {
    await qc.invalidateQueries({ queryKey: ticketKeys.all });
  };

  const create = useMutation({ mutationFn: createTicket, onSuccess: invalidate });
  const setStatus = useMutation({
    mutationFn: (v: { status: string; note?: string }) => changeTicketStatus(id as string, v.status, v.note),
    onSuccess: invalidate,
  });
  const setPriority = useMutation({
    mutationFn: (priority: string) => changeTicketPriority(id as string, priority),
    onSuccess: invalidate,
  });
  const assign = useMutation({
    mutationFn: (assigneeId: string | null) => assignTicket(id as string, assigneeId),
    onSuccess: invalidate,
  });
  const comment = useMutation({
    mutationFn: (v: { body: string; isInternal: boolean }) => addTicketComment(id as string, v.body, v.isInternal),
    onSuccess: async () => {
      await invalidate();
      if (id) await qc.invalidateQueries({ queryKey: ticketKeys.detail(id) });
    },
  });
  const attach = useMutation({
    mutationFn: (file: File) => uploadTicketAttachment(id as string, file),
    onSuccess: invalidate,
  });

  return { create, setStatus, setPriority, assign, comment, attach };
}
