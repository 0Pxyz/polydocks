import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import app from "../server/index";
import { ensureAuthTables } from "../server/auth/membership";
import { clearAuthOutbox, readAuthOutbox } from "../server/auth/index";
import { wipeRunPrefix } from "./isolation-db";
import { listWorkspaces } from "../server/workspace/workspaces";

const RUN = `auth-test-${Date.now()}`;
const emailA = `${RUN}-a@example.com`;
const emailB = `${RUN}-b@example.com`;
const PASS = "correct-horse-8-x";

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
    // An emptied cookie means deletion (sign-out): drop it from the jar.
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
      // Better Auth enforces an origin check on session-authenticated
      // writes (CSRF protection); browsers always send Origin, tests set it.
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
        referer: "http://localhost:3000/settings",
      },
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


describe("Better Auth foundation (local-first)", () => {
  beforeAll(async () => {
    wipeRunPrefix(RUN);
    await ensureAuthTables();
    clearAuthOutbox();
  });

  afterAll(() => {
    wipeRunPrefix(RUN);
  });

  it("migrates additively, idempotently, and preserves local workspaces", async () => {
    const before = listWorkspaces().map((w) => w.id);
    expect(before).toContain("default");
    const first = await ensureAuthTables();
    const second = await ensureAuthTables();
    expect(second.created).toEqual([]);
    expect(second.added).toEqual([]);
    const after = listWorkspaces().map((w) => w.id);
    expect(after).toEqual(expect.arrayContaining(before));
    expect(first).toBeDefined();
  });

  it("signs up with email/password and rejects invalid credentials", async () => {
    const { res, data, jar } = await post("/api/auth/sign-up/email", {
      name: "Auth Test A",
      email: emailA,
      password: PASS,
    });
    expect(res.ok).toBe(true);
    expect(data?.user?.email).toBe(emailA);
    expect(jar.length).toBeGreaterThan(0);

    const bad = await post("/api/auth/sign-in/email", { email: emailA, password: "wrong-password-1" });
    expect(bad.res.ok).toBe(false);

    const missing = await post("/api/auth/sign-in/email", {
      email: `${RUN}-nobody@example.com`,
      password: PASS,
    });
    expect(missing.res.ok).toBe(false);
  });

  it("persists the session across requests (cookie reload)", async () => {
    const signed = await post("/api/auth/sign-in/email", { email: emailA, password: PASS });
    expect(signed.res.ok).toBe(true);
    const me = await get("/api/auth/get-session", signed.jar);
    expect(me.res.ok).toBe(true);
    expect((me.data as any)?.user?.email).toBe(emailA);
    // A second request with the same jar still resolves (reload persistence).
    const again = await get("/api/auth/get-session", signed.jar);
    expect((again.data as any)?.user?.email).toBe(emailA);
  });

  it("verifies email through the outbox link", async () => {
    await post("/api/auth/sign-in/email", { email: emailA, password: PASS });
    const entry = readAuthOutbox().find((e) => e.to === emailA && e.kind === "verification");
    expect(entry).toBeDefined();
    const token = new URL(entry!.url).searchParams.get("token");
    expect(token).toBeTruthy();
    const verify = await get(`/api/auth/verify-email?token=${encodeURIComponent(token!)}`);
    expect(verify.res.ok).toBe(true);
    const signed = await post("/api/auth/sign-in/email", { email: emailA, password: PASS });
    const me = await get("/api/auth/get-session", signed.jar);
    expect((me.data as any)?.user?.emailVerified).toBe(true);
  });

  it("resets the password through the outbox link", async () => {
    const reqReset = await post("/api/auth/request-password-reset", {
      email: emailA,
      redirectTo: "http://localhost:3000/settings",
    });
    expect(reqReset.res.ok).toBe(true);
    const entry = readAuthOutbox().find((e) => e.to === emailA && e.kind === "reset");
    expect(entry).toBeDefined();
    // Reset links carry the token in the path:
    // /api/auth/reset-password/<token>?callbackURL=...
    const token =
      new URL(entry!.url).searchParams.get("token") ??
      entry!.url.split("?")[0].split("/").pop();
    expect(token).toBeTruthy();
    const NEW_PASS = "brand-new-pass-9-x";
    const done = await post("/api/auth/reset-password", { newPassword: NEW_PASS, token });
    expect(done.res.ok).toBe(true);
    const oldLogin = await post("/api/auth/sign-in/email", { email: emailA, password: PASS });
    expect(oldLogin.res.ok).toBe(false);
    const newLogin = await post("/api/auth/sign-in/email", { email: emailA, password: NEW_PASS });
    expect(newLogin.res.ok).toBe(true);
    // Restore the original password for the remaining tests.
    const again = await post("/api/auth/request-password-reset", {
      email: emailA,
      redirectTo: "http://localhost:3000/settings",
    });
    expect(again.res.ok).toBe(true);
    const back = readAuthOutbox().filter((e) => e.to === emailA && e.kind === "reset").at(-1)!;
    const backToken =
      new URL(back.url).searchParams.get("token") ?? back.url.split("?")[0].split("/").pop();
    const restored = await post("/api/auth/reset-password", { newPassword: PASS, token: backToken });
    expect(restored.res.ok).toBe(true);
  });

  it("lists sessions and revokes one of them", async () => {
    const first = await post("/api/auth/sign-in/email", { email: emailA, password: PASS });
    const second = await post("/api/auth/sign-in/email", { email: emailA, password: PASS });
    const listed = await get("/api/auth/list-sessions", first.jar);
    expect(listed.res.ok).toBe(true);
    const tokens = ((listed.data as any) as Array<{ token: string }>).map((s) => s.token);
    expect(tokens.length).toBeGreaterThanOrEqual(2);
    // Revoke exactly the second session; the first must survive.
    const rawSecond = decodeURIComponent(second.jar.find((c) => c.startsWith("better-auth.session_token=")) ?? "");
    const secondToken = rawSecond.split("=")[1]?.split(".")[0];
    expect(tokens).toContain(secondToken);
    const revoked = await post("/api/auth/revoke-session", { token: secondToken }, first.jar);
    expect(revoked.res.ok).toBe(true);
    const remaining = await get("/api/auth/list-sessions", first.jar);
    expect(((remaining.data as any) as unknown[]).length).toBe(tokens.length - 1);
    // The revoked jar resolves to no session (Better Auth returns 200 null)
    // while the surviving jar still resolves.
    const dead = await get("/api/auth/get-session", second.jar);
    expect((dead.data as any)?.user ?? (dead.data as any)?.session ?? dead.data).toBeNull();
    const alive = await get("/api/auth/get-session", first.jar);
    expect((alive.data as any)?.user?.email).toBe(emailA);
  });

  it("revokes the session on sign out", async () => {
    const signed = await post("/api/auth/sign-in/email", { email: emailA, password: PASS });
    const out = await post("/api/auth/sign-out", {}, signed.jar);
    expect(out.res.ok).toBe(true);
    const me = await get("/api/auth/get-session", out.jar);
    expect((me.data as any)?.user ?? (me.data as any)?.session ?? null).toBeNull();
  });

  it("isolates owned workspaces between users and keeps local workspaces open", async () => {
    const a = await post("/api/auth/sign-in/email", { email: emailA, password: PASS });
    const userIdA = (a.data as any)?.user?.id as string;
    expect(userIdA).toBeTruthy();

    // User A creates a workspace -> becomes its owner.
    const created = await post(
      "/api/workspaces",
      { id: `${RUN}-owned`, name: "Owned Lab", icon: "Flask" },
      a.jar
    );
    expect(created.res.status).toBe(201);

    // Anonymous local callers still see device-local workspaces but not the owned one.
    const anonList = await get("/api/workspaces");
    const anonIds = ((anonList.data as any)?.data ?? []).map((w: any) => w.id);
    expect(anonIds).toContain("default");
    expect(anonIds).not.toContain(`${RUN}-owned`);
    const anonGet = await get(`/api/workspaces/${RUN}-owned`);
    expect(anonGet.res.status).toBe(404);

    // A second user signs up and must be denied.
    await post("/api/auth/sign-up/email", { name: "Auth Test B", email: emailB, password: PASS });
    const b = await post("/api/auth/sign-in/email", { email: emailB, password: PASS });
    const forbidden = await get(`/api/workspaces/${RUN}-owned`, b.jar);
    expect(forbidden.res.status).toBe(404);
    const forbiddenSession = await post(
      "/api/sessions",
      { workspaceId: `${RUN}-owned`, title: "intruder" },
      b.jar
    );
    expect(forbiddenSession.res.status).toBe(404);

    // The owner keeps full access.
    const allowed = await get(`/api/workspaces/${RUN}-owned`, a.jar);
    expect(allowed.res.status).toBe(200);
    const ownerSession = await post(
      "/api/sessions",
      { workspaceId: `${RUN}-owned`, title: "owner notes" },
      a.jar
    );
    expect(ownerSession.res.status).toBe(201);

    // Non-owners cannot delete; the workspace stays owned by A.
    const deleteDenied = await req(`/api/workspaces/${RUN}-owned`, { method: "DELETE" }, b.jar);
    expect(deleteDenied.status).toBe(404);
  });

  it("denies cross-user conversation, task and artifact access", async () => {
    const a = await post("/api/auth/sign-in/email", { email: emailA, password: PASS });
    const b = await post("/api/auth/sign-in/email", { email: emailB, password: PASS });
    const created = await post(
      "/api/sessions",
      { workspaceId: `${RUN}-owned`, title: "private thread" },
      a.jar
    );
    expect(created.res.status).toBe(201);
    const sessionId = (created.data as any)?.session?.id as string;
    expect(sessionId).toBeTruthy();

    const peek = await get(`/api/sessions/${sessionId}`, b.jar);
    expect(peek.res.status).toBe(404);

    const tasks = await get(`/api/tasks?sessionId=${sessionId}`, b.jar);
    expect((tasks.data as any)?.tasks).toEqual([]);

    const artifact = await post(
      "/api/artifacts",
      { workspaceId: `${RUN}-owned`, name: "secret", content: "x" },
      a.jar
    );
    expect(artifact.res.status).toBe(201);
    const artifactId = (artifact.data as any)?.artifact?.id as string;
    const artifactPeek = await get(`/api/artifacts/${artifactId}`, b.jar);
    expect(artifactPeek.res.status).toBe(404);
  });

  it("reports OAuth providers as disabled without credentials", async () => {
    const status = await get("/api/account/status");
    expect((status.data as any)?.providers?.google).toBe(false);
    expect((status.data as any)?.providers?.github).toBe(false);
    const membered = await get("/api/account/memberships", []);
    expect((membered.data as any)?.memberships).toEqual([]);
  });

  it("keeps anonymous local mode working (no auth required)", async () => {
    const list = await get("/api/workspaces");
    expect(list.res.ok).toBe(true);
    expect(((list.data as any)?.data ?? []).some((w: any) => w.id === "default")).toBe(true);
    const thread = await get("/api/agent/thread");
    expect(thread.res.ok).toBe(true);
  });
});
