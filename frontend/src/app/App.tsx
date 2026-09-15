import { BrowserRouter, Routes, Route, NavLink, Outlet, useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@/features/auth/auth-context";
import { Providers } from "./providers";
import { RequireAuth, RequirePermission } from "./guards";
import { LoginPage } from "@/pages/Login/LoginPage";
import { DashboardPage } from "@/pages/Dashboard/DashboardPage";
import { TicketsPage } from "@/pages/Tickets/TicketsPage";
import { TicketDetailPage } from "@/pages/Tickets/TicketDetailPage";
import { AssetsPage } from "@/pages/Assets/AssetsPage";
import { AssetDetailPage } from "@/pages/Assets/AssetDetailPage";
import { NotificationsPage } from "@/pages/Notifications/NotificationsPage";
import { ReportsPage } from "@/pages/Reports/ReportsPage";
import { ProfilePage } from "@/pages/Profile/ProfilePage";
import { AdminUsersPage } from "@/pages/Admin/AdminUsersPage";
import { AdminRolesPage } from "@/pages/Admin/AdminRolesPage";
import { AdminAuditPage } from "@/pages/Admin/AdminAuditPage";

function Shell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const link = ({ isActive }: { isActive: boolean }) =>
    `rounded-md px-3 py-2 text-sm font-medium ${isActive ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"}`;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
          <span className="text-lg font-bold text-blue-700">SecureDesk</span>
          <nav className="ml-4 flex flex-1 items-center gap-1 overflow-x-auto">
            <NavLink to="/dashboard" className={link}>
              Dashboard
            </NavLink>
            <NavLink to="/tickets" className={link}>
              Tickets
            </NavLink>
            {user && user.permissions.some((p) => p.startsWith("asset:read")) ? (
              <NavLink to="/assets" className={link}>
                Assets
              </NavLink>
            ) : null}
            {user?.permissions.includes("report:read") ? (
              <NavLink to="/reports" className={link}>
                Reports
              </NavLink>
            ) : null}
            {user?.permissions.includes("user:manage") ? (
              <NavLink to="/admin/users" className={link}>
                Admin
              </NavLink>
            ) : null}
            {user?.permissions.includes("role:manage") || user?.permissions.includes("permission:manage") ? (
              <NavLink to="/admin/roles" className={link}>
                Roles
              </NavLink>
            ) : null}
            {user?.permissions.includes("audit:read") ? (
              <NavLink to="/admin/audit" className={link}>
                Audit
              </NavLink>
            ) : null}
          </nav>
          <NavLink to="/notifications" className={link} title="Notifications">
            🔔
          </NavLink>
          <NavLink to="/profile" className={link}>
            {user?.name ?? "Profile"}
          </NavLink>
          <button
            className="btn-secondary"
            onClick={async () => {
              await logout();
              navigate("/login");
            }}
          >
            Log out
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Providers>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <RequireAuth>
                <Shell />
              </RequireAuth>
            }
          >
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/tickets" element={<TicketsPage />} />
            <Route path="/tickets/:id" element={<TicketDetailPage />} />
            <Route path="/assets" element={<AssetsPage />} />
            <Route path="/assets/:id" element={<AssetDetailPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route
              path="/reports"
              element={
                <RequirePermission perm="report:read">
                  <ReportsPage />
                </RequirePermission>
              }
            />
            <Route path="/profile" element={<ProfilePage />} />
            <Route
              path="/admin/users"
              element={
                <RequirePermission perm="user:manage">
                  <AdminUsersPage />
                </RequirePermission>
              }
            />
            <Route
              path="/admin/roles"
              element={
                <RequirePermission perm="role:manage">
                  <AdminRolesPage />
                </RequirePermission>
              }
            />
            <Route
              path="/admin/audit"
              element={
                <RequirePermission perm="audit:read">
                  <AdminAuditPage />
                </RequirePermission>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Providers>
    </BrowserRouter>
  );
}
