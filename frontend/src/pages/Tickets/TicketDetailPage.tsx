import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/auth-context";
import { useTicket, useTicketMutations } from "@/hooks/useTickets";
import { fetchUsers } from "@/api/admin";
import { Badge, ErrorState, LoadingState, Field } from "@/components/ui/ui";
import { attachmentDownloadUrl } from "@/api/tickets";
import { ApiError } from "@/api/client";

const STATUS_OPTIONS = ["ASSIGNED", "IN_PROGRESS", "PENDING", "RESOLVED", "CLOSED"];
const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];

export function TicketDetailPage() {
  const { id = "" } = useParams();
  const { user, has } = useAuth();
  const { data: ticket, isLoading, isError, error, refetch } = useTicket(id);
  const { setStatus, setPriority, assign, comment, attach } = useTicketMutations(id);

  const [commentBody, setCommentBody] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const isAgent = has("ticket:update");
  const canAssign = has("ticket:assign");
  const isRequester = user?.id === ticket?.requester.id;
  const canComment = isAgent || (isRequester && has("ticket:comment:own"));

  // Agents with user:manage visibility use /users; fall back to no list otherwise.
  const { data: agents } = useQuery({
    queryKey: ["agents"],
    queryFn: () => fetchUsers({ role: "IT_SUPPORT", pageSize: 100 }),
    enabled: canAssign,
  });

  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState message={(error as ApiError).message} onRetry={() => refetch()} />;
  if (!ticket) return <ErrorState message="Ticket not found" />;

  const doAction = async (fn: () => Promise<unknown>) => {
    setActionError(null);
    try {
      await fn();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Action failed");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-slate-800">{ticket.title}</h1>
            <Badge value={ticket.status} />
            <Badge value={ticket.priority} />
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Requested by {ticket.requester.name} · {new Date(ticket.createdAt).toLocaleString()}
            {ticket.category ? ` · ${ticket.category.name}` : ""}
          </p>
        </div>
        <Link to="/tickets" className="btn-secondary">
          ← All tickets
        </Link>
      </div>

      {actionError ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {actionError}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main column */}
        <div className="space-y-6 lg:col-span-2">
          <section className="card p-5">
            <h2 className="text-sm font-semibold text-slate-700">Description</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{ticket.description}</p>
          </section>

          <section className="card">
            <h2 className="border-b border-slate-200 px-5 py-4 text-sm font-semibold text-slate-700">
              Comments ({ticket.comments.length})
            </h2>
            <ul className="divide-y divide-slate-100">
              {ticket.comments.map((c) => (
                <li key={c.id} className="px-5 py-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-700">
                      {c.author.name}
                      {c.isInternal ? <span className="badge ml-2 bg-amber-100 text-amber-800">internal</span> : null}
                    </p>
                    <p className="text-xs text-slate-400">{new Date(c.createdAt).toLocaleString()}</p>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{c.body}</p>
                </li>
              ))}
              {ticket.comments.length === 0 ? <li className="px-5 py-6 text-sm text-slate-400">No comments yet.</li> : null}
            </ul>
            {canComment ? (
              <form
                className="border-t border-slate-200 p-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!commentBody.trim()) return;
                  void doAction(async () => {
                    await comment.mutateAsync({ body: commentBody, isInternal });
                    setCommentBody("");
                    setIsInternal(false);
                  });
                }}
              >
                <Field label="Add comment">
                  <textarea
                    className="input min-h-[80px]"
                    value={commentBody}
                    onChange={(e) => setCommentBody(e.target.value)}
                    placeholder="Write a reply…"
                  />
                </Field>
                {isAgent ? (
                  <label className="mt-2 flex items-center gap-2 text-sm text-slate-600">
                    <input type="checkbox" checked={isInternal} onChange={(e) => setIsInternal(e.target.checked)} />
                    Internal note (hidden from requester)
                  </label>
                ) : null}
                <button className="btn-primary mt-3" disabled={comment.isPending}>
                  {comment.isPending ? "Posting…" : "Post comment"}
                </button>
              </form>
            ) : null}
          </section>

          <section className="card">
            <h2 className="border-b border-slate-200 px-5 py-4 text-sm font-semibold text-slate-700">History</h2>
            <ul className="divide-y divide-slate-100">
              {ticket.history.map((h) => (
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

        {/* Side column */}
        <div className="space-y-6">
          {isAgent || canAssign ? (
            <section className="card p-5">
              <h2 className="text-sm font-semibold text-slate-700">Agent actions</h2>

              <div className="mt-4 space-y-4">
                <Field label="Status">
                  <select
                    className="input"
                    value={ticket.status}
                    onChange={(e) => void doAction(() => setStatus.mutateAsync({ status: e.target.value }))}
                  >
                    <option value={ticket.status}>{ticket.status.replaceAll("_", " ")}</option>
                    {STATUS_OPTIONS.filter((s) => s !== ticket.status).map((s) => (
                      <option key={s} value={s}>
                        {s.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Priority">
                  <select
                    className="input"
                    value={ticket.priority}
                    onChange={(e) => void doAction(() => setPriority.mutateAsync(e.target.value))}
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </Field>

                {canAssign ? (
                  <Field label="Assignee">
                    <select
                      className="input"
                      value={ticket.assignee?.id ?? ""}
                      onChange={(e) => void doAction(() => assign.mutateAsync(e.target.value || null))}
                    >
                      <option value="">Unassigned</option>
                      {agents?.items.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.email})
                        </option>
                      ))}
                      {/* Keep the current assignee selectable even if not in the filtered list */}
                      {ticket.assignee && !agents?.items.some((u) => u.id === ticket.assignee!.id) ? (
                        <option value={ticket.assignee.id}>{ticket.assignee.name}</option>
                      ) : null}
                    </select>
                  </Field>
                ) : null}
              </div>
            </section>
          ) : (
            <section className="card p-5">
              <h2 className="text-sm font-semibold text-slate-700">Ticket info</h2>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-500">Assignee</dt>
                  <dd className="font-medium text-slate-700">{ticket.assignee?.name ?? "Unassigned"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">SLA due</dt>
                  <dd className="font-medium text-slate-700">
                    {ticket.slaResolutionDueAt ? new Date(ticket.slaResolutionDueAt).toLocaleString() : "—"}
                  </dd>
                </div>
              </dl>
            </section>
          )}

          <section className="card p-5">
            <h2 className="text-sm font-semibold text-slate-700">Attachments</h2>
            <ul className="mt-3 space-y-2">
              {ticket.attachments.map((a) => (
                <li key={a.id}>
                  <a
                    className="text-sm text-blue-600 hover:underline"
                    href={attachmentDownloadUrl(id, a.id)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    📎 {a.filename}{" "}
                    <span className="text-xs text-slate-400">({Math.max(1, Math.round(a.sizeBytes / 1024))} KB)</span>
                  </a>
                </li>
              ))}
              {ticket.attachments.length === 0 ? <li className="text-sm text-slate-400">No attachments.</li> : null}
            </ul>
            {canComment ? (
              <input
                type="file"
                className="mt-3 block w-full text-sm text-slate-500 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-slate-200"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void doAction(() => attach.mutateAsync(f));
                }}
              />
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}
