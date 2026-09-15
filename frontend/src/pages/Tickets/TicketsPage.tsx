import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/features/auth/auth-context";
import { useTickets, useTicketMutations } from "@/hooks/useTickets";
import { fetchCategories } from "@/api/auth";
import { Badge, EmptyState, ErrorState, Field, LoadingState, Modal, Pagination } from "@/components/ui/ui";
import { ApiError } from "@/api/client";

const STATUSES = ["OPEN", "ASSIGNED", "IN_PROGRESS", "PENDING", "RESOLVED", "CLOSED"] as const;
const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;

const createFormSchema = z.object({
  title: z.string().trim().min(5, "At least 5 characters").max(200),
  description: z.string().trim().min(10, "Describe the issue in at least 10 characters").max(10_000),
  categoryId: z.string().optional(),
  priority: z.enum(PRIORITIES),
});
type CreateForm = z.infer<typeof createFormSchema>;

export function TicketsPage() {
  const { has } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showCreate, setShowCreate] = useState(false);

  const page = Number(searchParams.get("page") ?? 1);
  const status = searchParams.get("status") ?? undefined;
  const priority = searchParams.get("priority") ?? undefined;
  const q = searchParams.get("q") ?? undefined;

  const tickets = useTickets({ status, priority, q, page, pageSize: 15 });
  const { data: categories } = useQuery({ queryKey: ["categories"], queryFn: fetchCategories });
  const { create } = useTicketMutations();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateForm>({ resolver: zodResolver(createFormSchema) });

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    setSearchParams(next);
  };

  const onCreate = async (values: CreateForm) => {
    try {
      await create.mutateAsync({
        title: values.title,
        description: values.description,
        priority: values.priority,
        categoryId: values.categoryId || null,
      });
      setShowCreate(false);
      reset();
    } catch {
      // Error surfaced via mutation.error below
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-800">Tickets</h1>
        {has("ticket:create") ? (
          <button className="btn-primary" onClick={() => setShowCreate(true)}>
            + New ticket
          </button>
        ) : null}
      </div>

      <div className="card flex flex-wrap items-center gap-3 p-4">
        <input
          className="input max-w-xs"
          placeholder="Search title or description…"
          defaultValue={q}
          onKeyDown={(e) => {
            if (e.key === "Enter") setParam("q", (e.target as HTMLInputElement).value);
          }}
        />
        <select className="input max-w-[11rem]" value={status ?? ""} onChange={(e) => setParam("status", e.target.value)}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replaceAll("_", " ")}
            </option>
          ))}
        </select>
        <select className="input max-w-[11rem]" value={priority ?? ""} onChange={(e) => setParam("priority", e.target.value)}>
          <option value="">All priorities</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      {tickets.isLoading ? (
        <LoadingState />
      ) : tickets.isError ? (
        <ErrorState message={(tickets.error as ApiError).message} onRetry={() => tickets.refetch()} />
      ) : (tickets.data?.items.length ?? 0) === 0 ? (
        <div className="card">
          <EmptyState title="No tickets found" hint="Try clearing filters or create a new ticket." />
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Title</th>
                <th className="th">Status</th>
                <th className="th">Priority</th>
                <th className="th">Requester</th>
                <th className="th">Assignee</th>
                <th className="th">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tickets.data!.items.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="td">
                    <Link to={`/tickets/${t.id}`} className="font-medium text-blue-700 hover:underline">
                      {t.title}
                    </Link>
                    {t.category ? <span className="ml-2 text-xs text-slate-400">{t.category.name}</span> : null}
                  </td>
                  <td className="td">
                    <Badge value={t.status} />
                  </td>
                  <td className="td">
                    <Badge value={t.priority} />
                  </td>
                  <td className="td">{t.requester.name}</td>
                  <td className="td">{t.assignee?.name ?? "—"}</td>
                  <td className="td text-slate-500">{new Date(t.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={page} pageSize={15} total={tickets.data!.total} onPage={(p) => setParam("page", String(p))} />
        </div>
      )}

      <Modal open={showCreate} title="Create ticket" onClose={() => setShowCreate(false)}>
        <form className="space-y-4" onSubmit={handleSubmit(onCreate)} noValidate>
          <Field label="Title" error={errors.title?.message}>
            <input className="input" placeholder="Short summary of the issue" {...register("title")} />
          </Field>
          <Field label="Description" error={errors.description?.message}>
            <textarea className="input min-h-[100px]" placeholder="What happened? What did you expect?" {...register("description")} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
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
            <Field label="Priority" error={errors.priority?.message}>
              <select className="input" defaultValue="MEDIUM" {...register("priority")}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {create.error ? (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{(create.error as ApiError).message}</p>
          ) : null}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setShowCreate(false)}>
              Cancel
            </button>
            <button className="btn-primary" disabled={create.isPending}>
              {create.isPending ? "Creating…" : "Create ticket"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
