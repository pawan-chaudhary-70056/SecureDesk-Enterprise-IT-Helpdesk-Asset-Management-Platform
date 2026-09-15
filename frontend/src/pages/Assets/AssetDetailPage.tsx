import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/api/client";
import { fetchUsers } from "@/api/admin";
import { fetchAsset, assignAsset, returnAsset, startMaintenance, endMaintenance, retireAsset } from "@/api/assets";
import { useAuth } from "@/features/auth/auth-context";
import { Badge, ErrorState, Field, LoadingState } from "@/components/ui/ui";

export function AssetDetailPage() {
  const { id = "" } = useParams();
  const qc = useQueryClient();
  const { has } = useAuth();

  const { data: asset, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["assets", "detail", id],
    queryFn: () => fetchAsset(id),
    enabled: !!id,
  });
  const { data: users } = useQuery({
    queryKey: ["users", "all"],
    queryFn: () => fetchUsers({ pageSize: 100 }),
    enabled: has("asset:manage"),
  });

  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [assignee, setAssignee] = useState("");

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ["assets"] });
  };

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
      await refresh();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState message={(error as ApiError).message} onRetry={() => refetch()} />;
  if (!asset) return <ErrorState message="Asset not found" />;

  const canManage = has("asset:manage");
  const s = asset.status;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-slate-800">{asset.name}</h1>
            <Badge value={s} />
          </div>
          <p className="mt-1 font-mono text-xs text-slate-400">{asset.assetTag}</p>
        </div>
        <Link to="/assets" className="btn-secondary">
          ← All assets
        </Link>
      </div>

      {actionError ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {actionError}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="card p-5">
            <h2 className="text-sm font-semibold text-slate-700">Details</h2>
            <dl className="mt-3 grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-slate-500">Serial number</dt>
                <dd className="font-medium text-slate-700">{asset.serialNumber ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Location</dt>
                <dd className="font-medium text-slate-700">{asset.location ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Category</dt>
                <dd className="font-medium text-slate-700">{asset.category?.name ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Assigned to</dt>
                <dd className="font-medium text-slate-700">{asset.assignedTo?.name ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Warranty until</dt>
                <dd className="font-medium text-slate-700">
                  {asset.warrantyUntil ? new Date(asset.warrantyUntil).toLocaleDateString() : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Registered</dt>
                <dd className="font-medium text-slate-700">{new Date(asset.createdAt).toLocaleDateString()}</dd>
              </div>
            </dl>
          </section>

          <section className="card">
            <h2 className="border-b border-slate-200 px-5 py-4 text-sm font-semibold text-slate-700">History</h2>
            <ul className="divide-y divide-slate-100">
              {asset.history.map((h) => (
                <li key={h.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                  <span className="text-slate-600">
                    <span className="font-medium text-slate-800">{h.action}</span>
                    {h.detail ? ` — ${h.detail}` : ""}
                  </span>
                  <span className="text-xs text-slate-400">{new Date(h.createdAt).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className="space-y-6">
          {canManage ? (
            <section className="card space-y-4 p-5">
              <h2 className="text-sm font-semibold text-slate-700">Lifecycle actions</h2>

              {s === "AVAILABLE" ? (
                <div className="space-y-3">
                  <Field label="Assign to">
                    <select className="input" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                      <option value="">— Select user —</option>
                      {users?.items.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.role.name})
                        </option>
                      ))}
                    </select>
                  </Field>
                  <button className="btn-primary w-full" disabled={!assignee || busy} onClick={() => act(() => assignAsset(id, assignee))}>
                    Assign
                  </button>
                  <button className="btn-secondary w-full" disabled={busy} onClick={() => act(() => startMaintenance(id))}>
                    Send to maintenance
                  </button>
                  <button className="btn-danger w-full" disabled={busy} onClick={() => act(() => retireAsset(id))}>
                    Retire asset
                  </button>
                </div>
              ) : null}

              {s === "ASSIGNED" ? (
                <div className="space-y-3">
                  <button className="btn-primary w-full" disabled={busy} onClick={() => act(() => returnAsset(id))}>
                    Mark returned
                  </button>
                  <button className="btn-secondary w-full" disabled={busy} onClick={() => act(() => startMaintenance(id))}>
                    Send to maintenance
                  </button>
                </div>
              ) : null}

              {s === "MAINTENANCE" ? (
                <button className="btn-primary w-full" disabled={busy} onClick={() => act(() => endMaintenance(id))}>
                  Maintenance complete
                </button>
              ) : null}

              {s === "RETURNED" ? (
                <div className="space-y-3">
                  <p className="text-xs text-slate-500">Return recorded. Make it available again to reassign.</p>
                  <button
                    className="btn-secondary w-full"
                    disabled={busy}
                    onClick={() => act(() => {
                      // RETURNED → AVAILABLE is a PATCH status change on the backend.
                      return api.patch(`/assets/${id}`, { status: "AVAILABLE" });
                    })}
                  >
                    Mark available
                  </button>
                  <button className="btn-danger w-full" disabled={busy} onClick={() => act(() => retireAsset(id))}>
                    Retire asset
                  </button>
                </div>
              ) : null}

              {s === "RETIRED" ? <p className="text-sm text-slate-400">This asset is retired and cannot change state.</p> : null}
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
