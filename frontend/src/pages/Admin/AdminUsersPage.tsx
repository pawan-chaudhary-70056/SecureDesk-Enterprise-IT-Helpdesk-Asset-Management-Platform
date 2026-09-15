import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { fetchUsers, createUser, updateUser } from "@/api/admin";
import { Badge, EmptyState, ErrorState, Field, LoadingState, Modal, Pagination } from "@/components/ui/ui";
import { ApiError } from "@/api/client";

const ROLES = ["EMPLOYEE", "IT_SUPPORT", "MANAGER", "ADMIN"] as const;

const createSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email(),
  password: z.string().min(10, "At least 10 characters"),
  role: z.enum(ROLES),
});
type CreateForm = z.infer<typeof createSchema>;

export function AdminUsersPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const users = useQuery({
    queryKey: ["admin", "users", { page, q, roleFilter }],
    queryFn: () => fetchUsers({ page, pageSize: 15, q: q || undefined, role: roleFilter || undefined }),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateForm>({ resolver: zodResolver(createSchema) });

  const onCreate = async (values: CreateForm) => {
    setServerError(null);
    try {
      await createUser(values);
      setShowCreate(false);
      reset();
      await qc.invalidateQueries({ queryKey: ["admin", "users"] });
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : "Failed to create user");
    }
  };

  const toggleActive = async (id: string, isActive: boolean) => {
    setActionError(null);
    try {
      await updateUser(id, { isActive });
      await qc.invalidateQueries({ queryKey: ["admin", "users"] });
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Failed to update user");
    }
  };

  const changeRole = async (id: string, role: string) => {
    setActionError(null);
    try {
      await updateUser(id, { role });
      await qc.invalidateQueries({ queryKey: ["admin", "users"] });
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Failed to change role");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-800">User management</h1>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>
          + Create user
        </button>
      </div>

      <div className="card flex flex-wrap items-center gap-3 p-4">
        <input
          className="input max-w-xs"
          placeholder="Search name or email…"
          value={q}
          onChange={(e) => {
            setPage(1);
            setQ(e.target.value);
          }}
        />
        <select
          className="input max-w-[12rem]"
          value={roleFilter}
          onChange={(e) => {
            setPage(1);
            setRoleFilter(e.target.value);
          }}
        >
          <option value="">All roles</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </div>

      {actionError ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {actionError}
        </p>
      ) : null}

      {users.isLoading ? (
        <LoadingState />
      ) : users.isError ? (
        <ErrorState message={(users.error as ApiError).message} onRetry={() => users.refetch()} />
      ) : (users.data?.items.length ?? 0) === 0 ? (
        <div className="card">
          <EmptyState title="No users found" />
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="th">User</th>
                <th className="th">Role</th>
                <th className="th">Status</th>
                <th className="th">Last login</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.data!.items.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="td">
                    <p className="font-medium text-slate-800">{u.name}</p>
                    <p className="text-xs text-slate-400">{u.email}</p>
                  </td>
                  <td className="td">
                    <select
                      className="input max-w-[11rem] py-1.5"
                      value={u.role.name}
                      onChange={(e) => void changeRole(u.id, e.target.value)}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r.replaceAll("_", " ")}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="td">
                    <button
                      className={u.isActive ? "badge bg-emerald-100 text-emerald-700" : "badge bg-slate-200 text-slate-500"}
                      onClick={() => void toggleActive(u.id, !u.isActive)}
                      title="Click to toggle"
                    >
                      {u.isActive ? "active" : "deactivated"}
                    </button>
                  </td>
                  <td className="td text-slate-500">
                    {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : "never"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={page} pageSize={15} total={users.data!.total} onPage={setPage} />
        </div>
      )}

      <Modal open={showCreate} title="Create user" onClose={() => setShowCreate(false)}>
        <form className="space-y-4" onSubmit={handleSubmit(onCreate)} noValidate>
          <Field label="Full name" error={errors.name?.message}>
            <input className="input" {...register("name")} />
          </Field>
          <Field label="Email" error={errors.email?.message}>
            <input className="input" type="email" {...register("email")} />
          </Field>
          <Field label="Temporary password" error={errors.password?.message}>
            <input className="input" type="text" placeholder="min 10 characters" {...register("password")} />
          </Field>
          <Field label="Role" error={errors.role?.message}>
            <select className="input" defaultValue="EMPLOYEE" {...register("role")}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </Field>
          {serverError ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{serverError}</p> : null}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setShowCreate(false)}>
              Cancel
            </button>
            <button className="btn-primary" disabled={isSubmitting}>
              {isSubmitting ? "Creating…" : "Create user"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
