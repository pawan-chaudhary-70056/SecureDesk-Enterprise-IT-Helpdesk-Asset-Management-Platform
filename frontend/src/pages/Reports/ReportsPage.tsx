import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import {
  fetchTicketReport,
  fetchResolutionReport,
  fetchSlaReport,
  fetchAssetReport,
} from "@/api/admin";
import { ErrorState, LoadingState } from "@/components/ui/ui";
import { ApiError } from "@/api/client";

const STATUS_COLORS: Record<string, string> = {
  OPEN: "#3b82f6",
  ASSIGNED: "#6366f1",
  IN_PROGRESS: "#f59e0b",
  PENDING: "#fb923c",
  RESOLVED: "#10b981",
  CLOSED: "#94a3b8",
};

const ASSET_COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#94a3b8", "#64748b"];

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="card p-5">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-semibold text-slate-800">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-400">{hint}</p> : null}
    </div>
  );
}

export function ReportsPage() {
  const tickets = useQuery({ queryKey: ["reports", "tickets"], queryFn: fetchTicketReport });
  const resolution = useQuery({ queryKey: ["reports", "resolution"], queryFn: fetchResolutionReport });
  const sla = useQuery({ queryKey: ["reports", "sla"], queryFn: fetchSlaReport });
  const assets = useQuery({ queryKey: ["reports", "assets"], queryFn: fetchAssetReport });

  if (tickets.isLoading || resolution.isLoading || sla.isLoading || assets.isLoading) return <LoadingState />;
  const anyError = [tickets, resolution, sla, assets].find((q) => q.isError);
  if (anyError) return <ErrorState message={(anyError.error as ApiError).message} onRetry={() => window.location.reload()} />;

  const statusData = tickets.data?.byStatus ?? [];
  const priorityData = tickets.data?.byPriority ?? [];
  const assetData = assets.data?.byStatus ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-800">Reports</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Tickets (total)" value={tickets.data?.total ?? 0} />
        <Stat
          label="Median resolution"
          value={`${(resolution.data?.medianHours ?? 0).toFixed(1)}h`}
          hint={`p90: ${(resolution.data?.p90Hours ?? 0).toFixed(1)}h`}
        />
        <Stat label="SLA breached (active)" value={sla.data?.currentlyBreached ?? 0} hint={`${sla.data?.approachingDeadline ?? 0} approaching deadline`} />
        <Stat label="Assets" value={assets.data?.total ?? 0} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="text-sm font-semibold text-slate-700">Tickets by status</h2>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statusData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="status" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {statusData.map((entry) => (
                    <Cell key={entry.status} fill={STATUS_COLORS[entry.status] ?? "#64748b"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="card p-5">
          <h2 className="text-sm font-semibold text-slate-700">Tickets by priority</h2>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={priorityData} dataKey="count" nameKey="priority" innerRadius={60} outerRadius={100} paddingAngle={2}>
                  {priorityData.map((entry) => (
                    <Cell key={entry.priority} fill={STATUS_COLORS[entry.priority] ?? "#64748b"} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="card p-5">
          <h2 className="text-sm font-semibold text-slate-700">Asset inventory</h2>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={assetData} dataKey="count" nameKey="status" innerRadius={60} outerRadius={100} paddingAngle={2}>
                  {assetData.map((entry, i) => (
                    <Cell key={entry.status} fill={ASSET_COLORS[i % ASSET_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="card p-5">
          <h2 className="text-sm font-semibold text-slate-700">Resolution performance</h2>
          <dl className="mt-4 space-y-4 text-sm">
            <div className="flex justify-between border-b border-slate-100 pb-3">
              <dt className="text-slate-500">Resolved tickets analyzed</dt>
              <dd className="font-semibold text-slate-800">{resolution.data?.count ?? 0}</dd>
            </div>
            <div className="flex justify-between border-b border-slate-100 pb-3">
              <dt className="text-slate-500">Median time to resolve</dt>
              <dd className="font-semibold text-slate-800">{(resolution.data?.medianHours ?? 0).toFixed(1)} hours</dd>
            </div>
            <div className="flex justify-between border-b border-slate-100 pb-3">
              <dt className="text-slate-500">90th percentile</dt>
              <dd className="font-semibold text-slate-800">{(resolution.data?.p90Hours ?? 0).toFixed(1)} hours</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Average</dt>
              <dd className="font-semibold text-slate-800">{(resolution.data?.averageHours ?? 0).toFixed(1)} hours</dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  );
}
