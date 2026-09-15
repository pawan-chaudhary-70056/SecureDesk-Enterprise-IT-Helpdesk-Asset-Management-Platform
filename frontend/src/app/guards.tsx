import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "@/features/auth/auth-context";
import { LoadingState } from "@/components/ui/ui";

/** Redirects unauthenticated users to /login (UX guard — backend still enforces). */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <LoadingState label="Restoring session…" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

/** Renders children only when a permission is present; otherwise a friendly 403 panel. */
export function RequirePermission({ perm, children }: { perm: string; children: ReactNode }) {
  const { has } = useAuth();
  if (has(perm)) return <>{children}</>;
  return (
    <div className="card mx-auto mt-10 max-w-md p-8 text-center">
      <p className="text-3xl">🔒</p>
      <h2 className="mt-3 text-base font-semibold text-slate-800">Not authorized</h2>
      <p className="mt-1 text-sm text-slate-500">
        Your role does not include the <code className="rounded bg-slate-100 px-1">{perm}</code> permission.
      </p>
    </div>
  );
}
