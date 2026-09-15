import { api } from "./client";
import type { AppNotification, Paginated } from "@/types";

export async function fetchNotifications(
  unreadOnly = false,
  page = 1,
  pageSize = 25,
): Promise<Paginated<AppNotification> & { unread: number }> {
  const r = await api.get("/notifications", { params: { unreadOnly, page, pageSize } });
  return r.data;
}

export async function markNotificationsRead(ids: string[]): Promise<void> {
  await api.post("/notifications/mark-read", { ids });
}

export async function markAllNotificationsRead(): Promise<void> {
  await api.post("/notifications/mark-all-read");
}
