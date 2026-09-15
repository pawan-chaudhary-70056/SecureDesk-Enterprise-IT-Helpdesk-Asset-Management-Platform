import type { ReactNode } from "react";
import { clsx } from "clsx";

/** Status/priority badge with consistent color mapping. */
export function Badge({ value, className }: { value: string; className?: string }) {
  const colors: Record<string, string> = {
    OPEN: "bg-blue-100 text-blue-700",
    ASSIGNED: "bg-indigo-100 text-indigo-700",
    IN_PROGRESS: "bg-amber-100 text-amber-800",
    PENDING: "bg-orange-100 text-orange-700",
    RESOLVED: "bg-emerald-100 text-emerald-700",
    CLOSED: "bg-slate-200 text-slate-600",
    LOW: "bg-slate-100 text-slate-600",
    MEDIUM: "bg-blue-100 text-blue-700",
    HIGH: "bg-orange-100 text-orange-800",
    URGENT: "bg-red-100 text-red-700",
    AVAILABLE: "bg-emerald-100 text-emerald-700",
    MAINTENANCE: "bg-amber-100 text-amber-800",
    RETURNED: "bg-slate-100 text-slate-600",
    RETIRED: "bg-slate-200 text-slate-500",
    EMPLOYEE: "bg-slate-100 text-slate-700",
    IT_SUPPORT: "bg-blue-100 text-blue-700",
    MANAGER: "bg-purple-100 text-purple-700",
    ADMIN: "bg-red-100 text-red-700",
  };
  const label = value.replaceAll("_", " ");
  return <span className={clsx("badge", colors[value] ?? "bg-slate-100 text-slate-600", className)}>{label}</span>;
}

export function Spinner({ className }: { className?: string }) {
  return (
    <div
      className={clsx("h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600", className)}
      role="status"
      aria-label="Loading"
    />
  );
}

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-slate-500">
      <Spinner />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="py-16 text-center">
      <p className="text-sm font-medium text-slate-600">{title}</p>
      {hint ? <p className="mt-1 text-sm text-slate-400">{hint}</p> : null}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="py-12 text-center">
      <p className="text-sm font-medium text-red-600">{message}</p>
      {onRetry ? (
        <button className="btn-secondary mt-3" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm">
      <span className="text-slate-500">
        Page {page} of {pages} · {total} total
      </span>
      <div className="flex gap-2">
        <button className="btn-secondary px-2.5 py-1.5" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </button>
        <button className="btn-secondary px-2.5 py-1.5" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}

export function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}

export function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="card w-full max-w-lg p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-800">{title}</h3>
          <button className="text-slate-400 hover:text-slate-600" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
