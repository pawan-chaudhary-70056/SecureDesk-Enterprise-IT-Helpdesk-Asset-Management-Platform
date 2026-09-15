import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAuditLogs, fetchSecurityEvents } from "@/api/admin";
import { EmptyState, ErrorState, LoadingState, Pagination } from "@/components/ui/ui";
import { ApiError } from "@/api/client";

export function AdminAuditPage() {
  const [tab, setTab] = useState<"audit" | "security">("audit");
  const [page, setPage] = useState(1);

  const audit = useQuery({
    queryKey: ["admin", "audit", page],
    queryFn: () => fetchAuditLogs({ page, pageSize: 25 }),
    enabled: tab === "audit",
  });
  const security = useQuery({
    queryKey: ["admin", "security", page],
    queryFn: () => fetchSecurityEvents({ page, pageSize: 25 }),
    enabled: tab === "security",
  });

  const active = tab === "audit" ? audit : security;
  const items = active.data?.items ?? [];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-slate-800">Audit & security</h1>

      <div className="flex gap-2">
        <button
          className={tab === "audit" ? "btn-primary" : "btn-secondary"}
          onClick={() => {
            setTab("audit");
            setPage(1);
          }}
        >
          Audit logs
        </button>
        <button
          className={tab === "security" ? "btn-primary" : "btn-secondary"}
          onClick={() => {
            setTab("security");
            setPage(1);
          }}
        >
          Security events
        </button>
      </div>

      {active.isLoading ? (
        <LoadingState />
      ) : active.isError ? (
        <ErrorState message={(active.error as ApiError).message} onRetry={() => active.refetch()} />
      ) : items.length === 0 ? (
        <div className="card">
          <EmptyState title="Nothing recorded yet" />
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="th">{tab === "audit" ? "Action" : "Type"}</th>
                <th className="th">Detail</th>
                <th className="th">Actor</th>
                <th className="th">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tab === "audit"
                ? (items as Awaited<ReturnType<typeof fetchAuditLogs>>["items"]).map((e) => (
                    <tr key={e.id} className="hover:bg-slate-50">
                      <td className="td">
                        <span className="badge bg-slate-100 text-slate-700">{e.action}</span>
                      </td>
                      <td className="td max-w-[24rem] truncate text-slate-500">
                        {e.detail ?? [e.entityType, e.entityId].filter(Boolean).join(" ")}
                      </td>
                      <td className="td">{e.actor?.name ?? "system"}</td>
                      <td className="td whitespace-nowrap text-slate-500">{new Date(e.createdAt).toLocaleString()}</td>
                    </tr>
                  ))
                : (items as Awaited<ReturnType<typeof fetchSecurityEvents>>["items"]).map((e) => (
                    <tr key={e.id} className="hover:bg-slate-50">
                      <td className="td">
                        <span className="badge bg-red-50 text-red-700">{e.type}</span>
                      </td>
                      <td className="td max-w-[24rem] truncate text-slate-500">
                        {[e.detail, e.email].filter(Boolean).join(" · ") || "—"}
                      </td>
                      <td className="td">{e.ip ?? "—"}</td>
                      <td className="td whitespace-nowrap text-slate-500">{new Date(e.createdAt).toLocaleString()}</td>
                    </tr>
                  ))}
            </tbody>
          </table>
          <Pagination page={page} pageSize={25} total={active.data!.total} onPage={setPage} />
        </div>
      )}
    </div>
  );
}
