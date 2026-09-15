import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchNotifications, markNotificationsRead, markAllNotificationsRead } from "@/api/notifications";
import { Badge, EmptyState, ErrorState, LoadingState, Pagination } from "@/components/ui/ui";
import { ApiError } from "@/api/client";

export function NotificationsPage() {
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const qc = useQueryClient();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["notifications", { page, unreadOnly }],
    queryFn: () => fetchNotifications(unreadOnly, page, 20),
  });

  const act = async (fn: () => Promise<unknown>) => {
    await fn();
    await qc.invalidateQueries({ queryKey: ["notifications"] });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-800">Notifications</h1>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} />
            Unread only
          </label>
          <button
            className="btn-secondary"
            disabled={(data?.unread ?? 0) === 0}
            onClick={() => void act(markAllNotificationsRead)}
          >
            Mark all read
          </button>
        </div>
      </div>

      {isLoading ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState message={(error as ApiError).message} onRetry={() => refetch()} />
      ) : (data?.items.length ?? 0) === 0 ? (
        <div className="card">
          <EmptyState title="No notifications" hint="You're all caught up." />
        </div>
      ) : (
        <div className="card overflow-hidden">
          <ul className="divide-y divide-slate-100">
            {data!.items.map((n) => (
              <li key={n.id} className={`flex items-start justify-between gap-4 px-5 py-4 ${n.readAt ? "" : "bg-blue-50/50"}`}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-slate-800">{n.title}</p>
                    <Badge value={n.type} className="!bg-slate-100 !text-slate-500" />
                  </div>
                  <p className="mt-0.5 text-sm text-slate-500">{n.body}</p>
                  <p className="mt-1 text-xs text-slate-400">{new Date(n.createdAt).toLocaleString()}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {n.ticketId ? (
                    <Link to={`/tickets/${n.ticketId}`} className="text-sm font-medium text-blue-600 hover:underline">
                      View ticket
                    </Link>
                  ) : null}
                  {!n.readAt ? (
                    <button className="text-sm text-slate-500 hover:underline" onClick={() => void act(() => markNotificationsRead([n.id]))}>
                      Mark read
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
          <Pagination page={page} pageSize={20} total={data!.total} onPage={setPage} />
        </div>
      )}
    </div>
  );
}
