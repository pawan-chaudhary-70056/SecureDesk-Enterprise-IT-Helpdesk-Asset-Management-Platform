import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchRoles, updateRolePermissions } from "@/api/admin";
import { ErrorState, LoadingState } from "@/components/ui/ui";
import { ApiError } from "@/api/client";

const CORE_ROLES = ["EMPLOYEE", "IT_SUPPORT", "MANAGER", "ADMIN"];

export function AdminRolesPage() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Local edit state per role id — never mutate the query cache in place.
  const [edits, setEdits] = useState<Record<string, Set<string>>>({});
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const roles = useQuery({ queryKey: ["admin", "roles"], queryFn: fetchRoles });

  const selected = roles.data?.find((r) => r.id === selectedId) ?? roles.data?.[0];
  const serverPerms = new Set<string>(selected?.permissions.map((p) => p.permission.name) ?? []);
  const selectedPerms = selected ? (edits[selected.id] ?? serverPerms) : new Set<string>();
  const isDirty = selected ? edits[selected.id] !== undefined : false;

  const toggle = (perm: string) => {
    if (!selected) return;
    const next = new Set(selectedPerms);
    if (next.has(perm)) next.delete(perm);
    else next.add(perm);
    setEdits((prev) => ({ ...prev, [selected.id]: next }));
  };

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      await updateRolePermissions(selected.id, [...selectedPerms]);
      setEdits((prev) => {
        const next = { ...prev };
        delete next[selected.id];
        return next;
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      await qc.invalidateQueries({ queryKey: ["admin", "roles"] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save permissions");
    } finally {
      setSaving(false);
    }
  };

  if (roles.isLoading) return <LoadingState />;
  if (roles.isError) return <ErrorState message={(roles.error as ApiError).message} onRetry={() => roles.refetch()} />;

  const allPermissions = [...new Set(roles.data?.flatMap((r) => r.permissions.map((p) => p.permission.name)) ?? [])].sort();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-800">Roles & permissions</h1>
        {saved ? <span className="badge bg-emerald-100 text-emerald-700">Saved</span> : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <nav className="card h-fit p-2">
          {roles.data?.map((r) => (
            <button
              key={r.id}
              className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm ${
                selected?.id === r.id ? "bg-blue-50 font-medium text-blue-700" : "text-slate-600 hover:bg-slate-50"
              }`}
              onClick={() => setSelectedId(r.id)}
            >
              <span>{r.name.replaceAll("_", " ")}</span>
              <span className="text-xs text-slate-400">{(edits[r.id] ?? new Set(r.permissions.map((p) => p.permission.name))).size}</span>
            </button>
          ))}
        </nav>

        <section className="card p-5">
          {selected ? (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-slate-800">{selected.name.replaceAll("_", " ")}</h2>
                  <p className="text-sm text-slate-500">{selected.description ?? ""}</p>
                </div>
                <div className="flex items-center gap-3">
                  {isDirty ? (
                    <button
                      className="btn-secondary"
                      onClick={() =>
                        setEdits((prev) => {
                          const next = { ...prev };
                          delete next[selected.id];
                          return next;
                        })
                      }
                    >
                      Discard
                    </button>
                  ) : null}
                  <button className="btn-primary" disabled={!isDirty || saving} onClick={() => void save()}>
                    {saving ? "Saving…" : "Save changes"}
                  </button>
                </div>
              </div>

              {error ? (
                <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                  {error}
                </p>
              ) : null}

              <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {allPermissions.map((perm) => (
                  <label
                    key={perm}
                    className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50"
                  >
                    <input type="checkbox" checked={selectedPerms.has(perm)} onChange={() => toggle(perm)} />
                    <code className="text-xs text-slate-600">{perm}</code>
                  </label>
                ))}
              </div>

              {CORE_ROLES.includes(selected.name) ? (
                <p className="mt-4 text-xs text-slate-400">
                  ⚠ This is a core system role. Changes apply immediately for all users with this role.
                </p>
              ) : null}
            </>
          ) : null}
        </section>
      </div>
    </div>
  );
}
