import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/auth-context";
import { useTickets } from "@/hooks/useTickets";
import { fetchNotifications } from "@/api/notifications";
import { Badge, EmptyState, LoadingState } from "@/components/ui/ui";

function StatCard({ label, value, to, accent }: { label: string; value: number | string; to: string; accent?: string }) {
  return (
    <Link to={to} className="card block p-5 transition-shadow hover:shadow-md">
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`mt-1 text-3xl font-semibold ${accent ?? "text-slate-800"}`}>{value}</p>
    </Link>
  );
}

export function DashboardPage() {
  const { user, has } = useAuth();
  const canReadAll = has("ticket:read:all");

  const { data: myTickets, isLoading } = useTickets({ pageSize: 5 });
  const { data: openQueue } = useTickets({ status: "OPEN", pageSize: 5 });
  const { data: notifs } = useQuery({
    queryKey: ["notifications", "recent"],
    queryFn: () => fetchNotifications(true, 1, 5),
  });

  const unread = notifs?.unread ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-800">Welcome back, {user?.name?.split(" ")[0]}</h1>
        <p className="mt-1 text-sm text-slate-500">
          Signed in as <Badge value={user?.role ?? ""} /> · {user?.email}
        </p>
      </div>

      {isLoading ? (
        <LoadingState />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="My open tickets" value={myTickets?.items.filter((t) => t.status !== "CLOSED").length ?? 0} to="/tickets" />
          <StatCard label="All my tickets" value={myTickets?.total ?? 0} to="/tickets" />
          {canReadAll || has("ticket:read:assigned") ? (
            <StatCard label="Unassigned queue" value={openQueue?.total ?? 0} to="/tickets?status=OPEN" accent="text-blue-700" />
          ) : null}
          <StatCard label="Unread notifications" value={unread} to="/notifications" accent={unread > 0 ? "text-red-600" : undefined} />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <h2 className="text-sm font-semibold text-slate-700">Recent tickets</h2>
            <Link to="/tickets" className="text-sm font-medium text-blue-600 hover:underline">
              View all →
            </Link>
          </div>
          {myTickets?.items.length ? (
            <ul className="divide-y divide-slate-100">
              {myTickets.items.map((t) => (
                <li key={t.id} className="flex items-center justify-between px-5 py-3">
                  <div className="min-w-0">
                    <Link to={`/tickets/${t.id}`} className="block truncate text-sm font-medium text-slate-800 hover:text-blue-600">
                      {t.title}
                    </Link>
                    <p className="text-xs text-slate-400">
                      {new Date(t.createdAt).toLocaleDateString()} · {t.priority}
                    </p>
                  </div>
                  <Badge value={t.status} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No tickets yet" hint="Create your first ticket from the Tickets page." />
          )}
        </section>

        <section className="card">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <h2 className="text-sm font-semibold text-slate-700">Unread notifications</h2>
            <Link to="/notifications" className="text-sm font-medium text-blue-600 hover:underline">
              View all →
            </Link>
          </div>
          {notifs?.items.length ? (
            <ul className="divide-y divide-slate-100">
              {notifs.items.map((n) => (
                <li key={n.id} className="px-5 py-3">
                  <p className="text-sm font-medium text-slate-700">{n.title}</p>
                  <p className="truncate text-xs text-slate-400">{n.body}</p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="You're all caught up" hint="No unread notifications." />
          )}
        </section>
      </div>
    </div>
  );
}
