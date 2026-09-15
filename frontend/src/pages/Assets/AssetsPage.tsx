import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/features/auth/auth-context";
import { fetchAssets, createAsset } from "@/api/assets";
import { fetchCategories } from "@/api/auth";
import { Badge, EmptyState, ErrorState, Field, LoadingState, Modal, Pagination } from "@/components/ui/ui";
import { ApiError } from "@/api/client";

const STATUSES = ["AVAILABLE", "ASSIGNED", "MAINTENANCE", "RETURNED", "RETIRED"] as const;

const createFormSchema = z.object({
  assetTag: z.string().trim().min(2).max(64),
  name: z.string().trim().min(2).max(200),
  serialNumber: z.string().trim().max(128).optional(),
  location: z.string().trim().max(200).optional(),
  categoryId: z.string().optional(),
});
type CreateForm = z.infer<typeof createFormSchema>;

export function AssetsPage() {
  const { has } = useAuth();
  const canManage = has("asset:manage");
  const [searchParams, setSearchParams] = useSearchParams();
  const [showCreate, setShowCreate] = useState(false);

  const page = Number(searchParams.get("page") ?? 1);
  const status = searchParams.get("status") ?? undefined;
  const q = searchParams.get("q") ?? undefined;

  const assets = useQuery({
    queryKey: ["assets", "list", { status, q, page }],
    queryFn: () => fetchAssets({ status, q, page, pageSize: 15 }),
  });
  const { data: categories } = useQuery({ queryKey: ["categories"], queryFn: fetchCategories });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateForm>({ resolver: zodResolver(createFormSchema) });
  const [serverError, setServerError] = useState<string | null>(null);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    setSearchParams(next);
  };

  const onCreate = async (values: CreateForm) => {
    setServerError(null);
    try {
      await createAsset({
        assetTag: values.assetTag,
        name: values.name,
        ...(values.serialNumber ? { serialNumber: values.serialNumber } : {}),
        ...(values.location ? { location: values.location } : {}),
        categoryId: values.categoryId || null,
      });
      setShowCreate(false);
      reset();
      await assets.refetch();
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : "Failed to create asset");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-800">Assets</h1>
        {canManage ? (
          <button className="btn-primary" onClick={() => setShowCreate(true)}>
            + Register asset
          </button>
        ) : null}
      </div>

      <div className="card flex flex-wrap items-center gap-3 p-4">
        <input
          className="input max-w-xs"
          placeholder="Search tag, name, serial…"
          defaultValue={q}
          onKeyDown={(e) => {
            if (e.key === "Enter") setParam("q", (e.target as HTMLInputElement).value);
          }}
        />
        <select className="input max-w-[12rem]" value={status ?? ""} onChange={(e) => setParam("status", e.target.value)}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {assets.isLoading ? (
        <LoadingState />
      ) : assets.isError ? (
        <ErrorState message={(assets.error as ApiError).message} onRetry={() => assets.refetch()} />
      ) : (assets.data?.items.length ?? 0) === 0 ? (
        <div className="card">
          <EmptyState title="No assets found" hint={canManage ? "Register your first asset." : "No assets are assigned to you."} />
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Tag</th>
                <th className="th">Name</th>
                <th className="th">Status</th>
                <th className="th">Category</th>
                <th className="th">Assigned to</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {assets.data!.items.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50">
                  <td className="td font-mono text-xs">{a.assetTag}</td>
                  <td className="td">
                    <Link to={`/assets/${a.id}`} className="font-medium text-blue-700 hover:underline">
                      {a.name}
                    </Link>
                  </td>
                  <td className="td">
                    <Badge value={a.status} />
                  </td>
                  <td className="td">{a.category?.name ?? "—"}</td>
                  <td className="td">{a.assignedTo?.name ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={page} pageSize={15} total={assets.data!.total} onPage={(p) => setParam("page", String(p))} />
        </div>
      )}

      <Modal open={showCreate} title="Register asset" onClose={() => setShowCreate(false)}>
        <form className="space-y-4" onSubmit={handleSubmit(onCreate)} noValidate>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Asset tag" error={errors.assetTag?.message}>
              <input className="input" placeholder="LT-0042" {...register("assetTag")} />
            </Field>
            <Field label="Name" error={errors.name?.message}>
              <input className="input" placeholder="MacBook Pro 14&quot;" {...register("name")} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Serial number">
              <input className="input" {...register("serialNumber")} />
            </Field>
            <Field label="Location">
              <input className="input" {...register("location")} />
            </Field>
          </div>
          <Field label="Category">
            <select className="input" {...register("categoryId")}>
              <option value="">— None —</option>
              {categories?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
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
              {isSubmitting ? "Saving…" : "Register"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
