import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import app from "../server/index";
import { ensureAuthTables } from "../server/auth/membership";
import { wipeRunPrefix } from "./isolation-db";

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

async function get(path: string, jar: string[] = []) {
  const res = await req(path, { method: "GET" }, jar);
  const data = await res.json().catch(() => ({}));
  return { res, data, jar: harvestCookies(res, jar) };
}

async function signIn(email: string, password: string) {
  return post("/api/auth/sign-in/email", { email, password });
}


/**
 * #215 (route-level slice): direct HTTP capability-invoke paths must honor
 * owned-workspace isolation, the same rule sessions/tasks/artifacts already
 * enforce. Uses sandbox.status (read-only, no Modal touch without a record).
 */
describe("capability invoke workspace isolation (#215)", () => {
  beforeAll(async () => {
    wipeRunPrefix(RUN);
    await ensureAuthTables();
  });

  afterAll(() => {
    wipeRunPrefix(RUN);
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

    // A session inside the owned workspace for the SSE checks below.
    const ownedSession = await post("/api/sessions", { workspaceId: OWNED, title: "sse probe" }, a.jar);
    expect(ownedSession.res.status).toBe(201);
    const ownedSessionId = (ownedSession.data as any)?.session?.id as string;
    expect(ownedSessionId).toBeTruthy();

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
    expect(f1.res.status).toBe(404);
    const f2 = await post("/api/capabilities/sandbox.status/invoke", { input: {}, workspaceId: OWNED }, b.jar);
    expect(f2.res.status).toBe(404);
    const f3 = await post("/api/plugins/sandbox/status", { workspaceId: OWNED }, b.jar);
    expect(f3.res.status).toBe(404);

    // Anonymous: denied on the owned workspace.
    const n1 = await post("/api/capabilities/invoke", ownerBody, []);
    expect(n1.res.status).toBe(404);

    // Unowned device-local workspace stays open (no behavior change).
    const open = await post(
      "/api/capabilities/invoke",
      { capabilityId: "sandbox.status", input: {}, workspaceId: "default" },
      []
    );
    expect(open.res.status).toBe(200);

    // SSE streams enforce the same rule before the stream starts.
    const deniedStream = await req(`/api/sessions/${ownedSessionId}/stream`, { method: "GET" }, b.jar);
    expect(deniedStream.status).toBe(404);
    const deniedJobStream = await req(`/api/tasks/stream?sessionId=${ownedSessionId}`, { method: "GET" }, b.jar);
    expect(deniedJobStream.status).toBe(404);
  });

  it("closes the device-local open path in cloud mode", async () => {
    const { config } = await import("../server/config");
    const prevMode = config.DEPLOY_MODE;
    (config as any).DEPLOY_MODE = "cloud";
    try {
      // No identity at all: every workspace resource fails, uniformly 404.
      const list = await get("/api/workspaces", []);
      expect(list.res.ok).toBe(true);
      expect(((list.data as any)?.data ?? []).some((w: any) => w.id === "default")).toBe(false);
      const one = await get("/api/workspaces/default", []);
      expect(one.res.status).toBe(404);
      const sess = await post("/api/sessions", { workspaceId: "default", title: "anon" }, []);
      expect(sess.res.status).toBe(404);
      const anon = await post(
        "/api/capabilities/invoke",
        { capabilityId: "sandbox.status", input: {}, workspaceId: "default" },
        []
      );
      expect(anon.res.status).toBe(404);
      const mem = await post("/api/agent/memory/recall", { query: "x" }, []);
      expect(mem.res.status).toBe(404);
      const thread = await get("/api/agent/thread", []);
      expect(thread.res.status).toBe(404);
    } finally {
      (config as any).DEPLOY_MODE = prevMode;
    }
  });
});
