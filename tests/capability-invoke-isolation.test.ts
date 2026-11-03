import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import app from "../server/index";
import { db } from "../server/workspace/db";
import { ensureAuthTables } from "../server/auth/membership";

const RUN = `cap-invoke-${Date.now()}`;
const PASS = "correct-horse-8-x";
const emailA = `${RUN}-a@example.com`;
const emailB = `${RUN}-b@example.com`;
const OWNED = `${RUN}-owned`;

function req(path: string, init?: RequestInit, cookies: string[] = []) {
  const headers = new Headers(init?.headers);
  if (cookies.length > 0) headers.set("cookie", cookies.join("; "));
  return app.fetch(new Request(`http://localhost:3000${path}`, { ...init, headers }));
}

function harvestCookies(res: Response, jar: string[]): string[] {
  const setCookies = res.headers.getSetCookie?.() ?? [];
  const next = [...jar];
  for (const sc of setCookies) {
    const pair = sc.split(";")[0];
    const name = pair.split("=")[0];
    const idx = next.findIndex((c) => c.startsWith(`${name}=`));
    if (/=($|;)/.test(pair) || pair.endsWith("=")) {
      if (idx >= 0) next.splice(idx, 1);
    } else if (idx >= 0) {
      next[idx] = pair;
    } else {
      next.push(pair);
    }
  }
  return next;
}

async function post(path: string, body: unknown, jar: string[] = []) {
  const res = await req(
    path,
    {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      body: JSON.stringify(body),
    },
    jar
  );
  const data = await res.json().catch(() => ({}));
  return { res, data, jar: harvestCookies(res, jar) };
}

async function signIn(email: string, password: string) {
  return post("/api/auth/sign-in/email", { email, password });
}

function cleanupUsers() {
  db.query(`DELETE FROM session WHERE userId IN (SELECT id FROM "user" WHERE email LIKE '${RUN}%')`).run();
  db.query(`DELETE FROM account WHERE userId IN (SELECT id FROM "user" WHERE email LIKE '${RUN}%')`).run();
  db.query(`DELETE FROM verification WHERE identifier LIKE '%${RUN}%'`).run();
  db.query(`DELETE FROM "user" WHERE email LIKE '${RUN}%' OR id LIKE '${RUN}%'`).run();
}

/**
 * #215 (route-level slice): direct HTTP capability-invoke paths must honor
 * owned-workspace isolation, the same rule sessions/tasks/artifacts already
 * enforce. Uses sandbox.status (read-only, no Modal touch without a record).
 */
describe("capability invoke workspace isolation (#215)", () => {
  beforeAll(async () => {
    await ensureAuthTables();
  });

  afterAll(() => {
    db.query(`DELETE FROM workspace_members WHERE workspace_id LIKE '${RUN}%'`).run();
    db.query(`DELETE FROM workspaces WHERE id LIKE '${RUN}%'`).run();
    cleanupUsers();
  });

  it("denies cross-user and anonymous invokes in owned workspaces", async () => {
    await post("/api/auth/sign-up/email", { name: "Cap A", email: emailA, password: PASS });
    await post("/api/auth/sign-up/email", { name: "Cap B", email: emailB, password: PASS });
    const a = await signIn(emailA, PASS);
    expect(a.res.ok).toBe(true);
    const b = await signIn(emailB, PASS);
    expect(b.res.ok).toBe(true);

    const created = await post("/api/workspaces", { id: OWNED, name: "Owned Lab", icon: "Flask" }, a.jar);
    expect(created.res.status).toBe(201);

    // Owner: allowed on all three invoke paths.
    const ownerBody = { capabilityId: "sandbox.status", input: {}, workspaceId: OWNED };
    const o1 = await post("/api/capabilities/invoke", ownerBody, a.jar);
    expect(o1.res.status).toBe(200);
    const o2 = await post("/api/capabilities/sandbox.status/invoke", { input: {}, workspaceId: OWNED }, a.jar);
    expect(o2.res.status).toBe(200);
    const o3 = await post("/api/plugins/sandbox/status", { workspaceId: OWNED }, a.jar);
    expect(o3.res.status).toBe(200);

    // Other user: denied on all three paths.
    const f1 = await post("/api/capabilities/invoke", ownerBody, b.jar);
    expect(f1.res.status).toBe(403);
    const f2 = await post("/api/capabilities/sandbox.status/invoke", { input: {}, workspaceId: OWNED }, b.jar);
    expect(f2.res.status).toBe(403);
    const f3 = await post("/api/plugins/sandbox/status", { workspaceId: OWNED }, b.jar);
    expect(f3.res.status).toBe(403);

    // Anonymous: denied on the owned workspace.
    const n1 = await post("/api/capabilities/invoke", ownerBody, []);
    expect(n1.res.status).toBe(403);

    // Unowned device-local workspace stays open (no behavior change).
    const open = await post(
      "/api/capabilities/invoke",
      { capabilityId: "sandbox.status", input: {}, workspaceId: "default" },
      []
    );
    expect(open.res.status).toBe(200);
  });
});
