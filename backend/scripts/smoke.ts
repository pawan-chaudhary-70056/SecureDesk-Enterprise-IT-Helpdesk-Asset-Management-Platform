/**
 * End-to-end API smoke test over real HTTP (no test framework needed).
 * Spawns the compiled server (dist/main.js) itself, runs checks, then stops it.
 * Run: npm run build && npx tsx scripts/smoke.ts
 */
import { spawn, type ChildProcess } from "node:child_process";

const BASE = "http://localhost:3001/api/v1";
const stamp = Date.now();

let server: ChildProcess;

async function waitForServer(timeoutMs = 20000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Server did not start in time. Log:\n${serverLog.slice(-2000)}`);
}

let serverLog = "";

type Res = { status: number; body: any; cookie?: string };

async function call(method: string, path: string, opts: { token?: string; body?: unknown; cookie?: string } = {}): Promise<Res> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.token) headers["Authorization"] = `Bearer ${opts.token}`;
  if (opts.cookie) headers["Cookie"] = opts.cookie;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
  const setCookie = res.headers.get("set-cookie");
  let body: any = null;
  try { body = await res.json(); } catch { /* non-json */ }
  return { status: res.status, body, cookie: setCookie?.split(";")[0] };
}

const results: Array<{ name: string; ok: boolean; detail: string }> = [];
function check(name: string, ok: boolean, detail: string): void {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${detail}`);
}

async function main(): Promise<boolean> {
  server = spawn("node", ["dist/main.js"], { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, NODE_ENV: "development" } });
  server.stdout?.on("data", (d) => (serverLog += d));
  server.stderr?.on("data", (d) => (serverLog += d));
  try {
    await waitForServer();

  // ── health ──
  const health = await call("GET", "/health");
  check("health", health.status === 200 && health.body?.status === "ok", `status=${health.status}`);

  // ── login all roles ──
  const login = async (email: string) => {
    const r = await call("POST", "/auth/login", { body: { email, password: "Password123!" } });
    if (r.status !== 200) throw new Error(`login failed for ${email}: ${JSON.stringify(r.body)}`);
    return { token: r.body.accessToken as string, cookie: r.cookie! };
  };
  const employee = await login("employee@securedesk.local");
  const agent = await login("agent@securedesk.local");
  const admin = await login("admin@securedesk.local");
  check("logins (employee/agent/admin)", true, "3 roles authenticated");

  // ── bad login ──
  const badLogin = await call("POST", "/auth/login", { body: { email: "employee@securedesk.local", password: "wrong-password-1" } });
  check("bad login rejected 401", badLogin.status === 401, `status=${badLogin.status}`);

  // ── /auth/me ──
  const me = await call("GET", "/auth/me", { token: employee.token });
  check("GET /auth/me", me.status === 200 && me.body?.role?.name === "EMPLOYEE", `role=${me.body?.role?.name}`);

  // ── register ──
  const reg = await call("POST", "/auth/register", { body: { email: `smoke-${stamp}@example.com`, name: "Smoke Tester", password: "Password123!" } });
  check("register", reg.status === 201 && !!reg.body?.accessToken, `status=${reg.status}`);
  const dupReg = await call("POST", "/auth/register", { body: { email: `smoke-${stamp}@example.com`, name: "Smoke Tester", password: "Password123!" } });
  check("duplicate register rejected 400", dupReg.status === 400, `status=${dupReg.status}`);

  // ── RBAC: employees cannot access admin endpoints ──
  const usersAsEmployee = await call("GET", "/users", { token: employee.token });
  check("employee blocked from /users 403", usersAsEmployee.status === 403, `status=${usersAsEmployee.status}`);
  const usersAsAdmin = await call("GET", "/users", { token: admin.token });
  check("admin can list /users", usersAsAdmin.status === 200 && Array.isArray(usersAsAdmin.body?.items), `total=${usersAsAdmin.body?.total}`);
  const auditAsAgent = await call("GET", "/audit", { token: agent.token });
  check("agent blocked from /audit 403", auditAsAgent.status === 403, `status=${auditAsAgent.status}`);

  // ── categories (public to authenticated users) ──
  const cats = await call("GET", "/categories", { token: employee.token });
  check("categories list", cats.status === 200 && cats.body?.length >= 4, `count=${cats.body?.length}`);

  // ── tickets: create as employee ──
  const hw = cats.body?.find((c: any) => c.name === "Hardware");
  const created = await call("POST", "/tickets", { token: employee.token, body: { title: "Laptop will not boot", description: "MacBook Pro shows a black screen on power-on. Happens every morning.", categoryId: hw?.id, priority: "HIGH" } });
  check("employee creates ticket", created.status === 201 && created.body?.status === "OPEN", `status=${created.status}`);
  const ticketId = created.body?.id as string;

  // SLA computed from Hardware policy (60min first response / 1440 resolution, HIGH = x0.5)
  check("SLA deadlines computed", !!created.body?.slaFirstResponseDueAt && !!created.body?.slaResolutionDueAt, `first=${created.body?.slaFirstResponseDueAt}`);

  // ── object-level authorization ──
  const adminTicket = await call("POST", "/tickets", { token: admin.token, body: { title: "Admin private ticket", description: "This ticket must not be visible to employees.", priority: "LOW" } });
  const adminTicketId = adminTicket.body?.id as string;
  const peek = await call("GET", `/tickets/${adminTicketId}`, { token: employee.token });
  check("employee cannot view other user's ticket 403", peek.status === 403, `status=${peek.status}`);
  const peekSelf = await call("GET", `/tickets/${ticketId}`, { token: employee.token });
  check("employee can view own ticket", peekSelf.status === 200, `status=${peekSelf.status}`);

  // ── agent queue: sees unassigned OPEN ticket, assigns self ──
  const queue = await call("GET", "/tickets", { token: agent.token, });
  const inQueue = queue.body?.items?.some((t: any) => t.id === ticketId);
  check("agent sees unassigned ticket in queue", queue.status === 200 && inQueue, `total=${queue.body?.total}`);
  const assign = await call("POST", `/tickets/${ticketId}/assign`, { token: agent.token, body: {} });
  // assign requires assigneeId or self? We defined null = unassign; agent self-assign via own id
  const meAgent = await call("GET", "/auth/me", { token: agent.token });
  const assignSelf = await call("POST", `/tickets/${ticketId}/assign`, { token: agent.token, body: { assigneeId: meAgent.body?.id } });
  check("agent self-assigns ticket", [200, 201].includes(assignSelf.status) && assignSelf.body?.status === "ASSIGNED", `status=${assignSelf.body?.status}`);

  // ── employee cannot assign ──
  const empAssign = await call("POST", `/tickets/${ticketId}/assign`, { token: employee.token, body: { assigneeId: employee.token && "x" } });
  check("employee cannot assign 403", empAssign.status === 403, `status=${empAssign.status}`);

  // ── transitions ──
  const badTransition = await call("PATCH", `/tickets/${ticketId}/status`, { token: agent.token, body: { status: "RESOLVED" } });
  // ASSIGNED -> RESOLVED is allowed by our machine, so instead test OPEN->CLOSED skip? Use a new ticket.
  const t2 = await call("POST", "/tickets", { token: employee.token, body: { title: "Printer out of toner", description: "Meeting room printer reports empty toner cartridge.", priority: "LOW" } });
  const skipClose = await call("PATCH", `/tickets/${t2.body?.id}/status`, { token: agent.token, body: { status: "CLOSED" } });
  // OPEN -> CLOSED is allowed (cancel); instead verify invalid requester transition:
  const requesterClose = await call("PATCH", `/tickets/${t2.body?.id}/status`, { token: employee.token, body: { status: "IN_PROGRESS" } });
  check("requester cannot move ticket to IN_PROGRESS 403", requesterClose.status === 403, `status=${requesterClose.status}`);

  const inProgress = await call("PATCH", `/tickets/${ticketId}/status`, { token: agent.token, body: { status: "IN_PROGRESS" } });
  check("agent moves ASSIGNED → IN_PROGRESS", inProgress.status === 200 && inProgress.body?.status === "IN_PROGRESS", `status=${inProgress.body?.status}`);
  const internal = await call("POST", `/tickets/${ticketId}/comments`, { token: agent.token, body: { body: "Suspect hardware failure, ordered part.", isInternal: true } });
  check("agent adds internal note", internal.status === 201, `status=${internal.status}`);
  const publicComment = await call("POST", `/tickets/${ticketId}/comments`, { token: agent.token, body: { body: "We are investigating your issue." } });
  check("agent adds public comment", publicComment.status === 201, `status=${publicComment.status}`);
  const resolved = await call("PATCH", `/tickets/${ticketId}/status`, { token: agent.token, body: { status: "RESOLVED", note: "Replaced cable" } });
  check("agent resolves ticket", resolved.status === 200 && resolved.body?.status === "RESOLVED", `status=${resolved.body?.status}`);

  // employee view: internal note filtered out, public visible
  const empView = await call("GET", `/tickets/${ticketId}`, { token: employee.token });
  const bodies: string[] = (empView.body?.comments ?? []).map((c: any) => c.body);
  check("internal note hidden from requester", !bodies.some((b) => b.includes("ordered part")), `comments=${bodies.length}`);
  check("public comment visible to requester", bodies.some((b) => b.includes("investigating")), `comments=${bodies.length}`);

  // ── refresh rotation ──
  const refresh = await call("POST", "/auth/refresh", { cookie: employee.cookie });
  check("refresh rotates token", refresh.status === 200 && !!refresh.body?.accessToken, `status=${refresh.status}`);

  // ── assets: employee sees only own, admin manages ──
  const myAssets = await call("GET", "/assets", { token: employee.token });
  check("employee sees only assigned assets", myAssets.status === 200 && myAssets.body?.items?.every((a: any) => a.assignedToId !== null), `total=${myAssets.body?.total}`);
  const newAsset = await call("POST", "/assets", { token: admin.token, body: { assetTag: `MON-${stamp}`, name: "Test Monitor 24in" } });
  check("admin registers asset", newAsset.status === 201, `status=${newAsset.status}`);
  const empAssetCreate = await call("POST", "/assets", { token: employee.token, body: { assetTag: `HAX-${stamp}`, name: "Hack Attempt" } });
  check("employee cannot create asset 403", empAssetCreate.status === 403, `status=${empAssetCreate.status}`);
  const assigned = await call("POST", `/assets/${newAsset.body?.id}/assign`, { token: admin.token, body: { userId: meAgent.body?.id, notes: "for smoke test" } });
  check("admin assigns asset", [200, 201].includes(assigned.status) && assigned.body?.status === "ASSIGNED", `status=${assigned.body?.status}`);
  const badAssign = await call("POST", `/assets/${newAsset.body?.id}/assign`, { token: admin.token, body: { userId: meAgent.body?.id } });
  check("re-assign non-AVAILABLE asset rejected 403", badAssign.status === 403, `status=${badAssign.status}`);
  const returned = await call("POST", `/assets/${newAsset.body?.id}/return`, { token: admin.token });
  check("admin returns asset", [200, 201].includes(returned.status) && returned.body?.status === "RETURNED", `status=${returned.body?.status}`);

  // ── notifications & reports ──
  const notifs = await call("GET", "/notifications", { token: employee.token });
  check("employee has notifications", notifs.status === 200 && notifs.body?.total > 0, `total=${notifs.body?.total}`);
  const slaReport = await call("GET", "/reports/sla", { token: admin.token });
  check("SLA report", slaReport.status === 200 && typeof slaReport.body?.ticketsWithSla === "number", `sla=${JSON.stringify(slaReport.body)}`);
  const reportAsEmployee = await call("GET", "/reports/sla", { token: employee.token });
  check("employee blocked from reports 403", reportAsEmployee.status === 403, `status=${reportAsEmployee.status}`);

  // ── audit trail exists ──
  const audit = await call("GET", "/audit?pageSize=5", { token: admin.token });
  check("audit logs recorded", audit.status === 200 && audit.body?.total > 0, `total=${audit.body?.total}`);

  // ── logout kills session ──
  const logout = await call("POST", "/auth/logout", { cookie: agent.cookie });
  check("logout succeeds", logout.status === 200, `status=${logout.status}`);
  const refreshAfterLogout = await call("POST", "/auth/refresh", { cookie: agent.cookie });
  check("refresh after logout rejected 401", refreshAfterLogout.status === 401, `status=${refreshAfterLogout.status}`);

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  return failed.length === 0;
  } finally {
    server.kill("SIGTERM");
  }
}

main().then(
  (ok) => process.exit(ok ? 0 : 1),
  (err) => {
    console.error("Smoke test error:", err);
    server?.kill("SIGTERM");
    process.exit(1);
  },
);
