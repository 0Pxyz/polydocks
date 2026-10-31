import { describe, it, expect, beforeAll } from "bun:test";
import { Hono } from "hono";
import { app } from "../server/index";
import { dockAction, pluginLifecycle, invokeCapability, agentSession, agentTask, agentArtifacts } from "../server/facade/shared";
import { initializeFirstPartyPlugins } from "../server/plugins/first-party";

const WS = "test-facade-parity-ws";

/**
 * Issue #164 parity harness: legacy routes and facade ops must agree on
 * state and envelopes. No behavior change — this harness pins equivalence
 * before the facade became the default surface.
 */
describe("Issue #164 — facade parity harness", () => {
  beforeAll(() => {
    initializeFirstPartyPlugins();
  });

  it("dock: shared handler, verb tool and HTTP route agree", async () => {
    const { dockRouter } = await import("../server/routes/dock");
    const probe = new Hono().route("/api/dock", dockRouter);

    // Shared handler is the source of truth.
    const shared: any = await dockAction("tabs.list", { workspaceId: WS }, { actor: "user", workspaceId: WS });
    expect(shared.ok).toBe(true);

    // HTTP route over the same handler.
    const httpRes = await probe.request("/api/dock/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "tabs.list", workspaceId: WS }),
    });
    const httpOut: any = await httpRes.json();
    expect(httpRes.status).toBe(200);
    expect(httpOut.ok).toBe(true);
    expect(JSON.stringify(httpOut.data?.dockItems ?? null)).toBe(JSON.stringify(shared.data?.dockItems ?? null));

    // Verb tool delegates in-process (no fetch to product routes).
    const { dockList } = await import("../server/agent/tools/verbs/dock");
    const toolOut: any = await dockList.execute({ workspaceId: WS } as any, { step: 1, workspaceId: WS });
    expect(toolOut.ok).toBe(true);
    expect(Array.isArray(toolOut.data.dockItems)).toBe(true);

    // Dock open emits tray.open on the shared path.
    const opened: any = await dockAction("tabs.open", { tabId: "browser", workspaceId: WS }, { actor: "user", workspaceId: WS });
    expect(opened.ok).toBe(true);
    expect(opened.events.map((e: any) => e.type)).toContain("tray.open");
  });

  it("lifecycle: HTTP route and shared handler agree (policy + envelope)", async () => {
    const httpRes = await app.request("/api/plugins/lifecycle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "install", pluginId: "no-such-plugin-xyz", workspaceId: WS }),
    });
    const httpOut: any = await httpRes.json();

    const shared: any = await pluginLifecycle("install", { pluginId: "no-such-plugin-xyz", workspaceId: WS }, { actor: "user", workspaceId: WS });
    expect(shared.ok).toBe(false);
    expect(shared.code).toBe("not_found");
    expect(httpOut.ok).toBe(shared.ok);
    expect(httpOut.code).toBe(shared.code);
  });

  it("capabilities: HTTP route resolves first-party (not only contracts)", async () => {
    const httpRes = await app.request("/api/plugins/browser/open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: { url: "https://example.com/parity", workspaceId: WS } }),
    });
    const httpOut: any = await httpRes.json();
    expect(httpRes.status).toBe(200);
    expect(httpOut.ok).toBe(true);

    const shared: any = await invokeCapability("browser", "open", { url: "https://example.com/parity", workspaceId: WS }, { actor: "user", workspaceId: WS });
    expect(shared.ok).toBe(true);
  });

  it("sessions/tasks/artifacts: legacy routes and facade ops agree", async () => {
    // Sessions list.
    const legacySessions = await app.request("/api/sessions");
    expect(legacySessions.status).toBe(200);
    const legacySessionsOut: any = await legacySessions.json();
    const facadeSessions: any = await agentSession("list", {});
    expect(facadeSessions.ok).toBe(true);
    expect((facadeSessions.data ?? []).length).toBe((legacySessionsOut.sessions ?? []).length);

    // Tasks list.
    const legacyTasks = await app.request("/api/tasks?status=running");
    expect(legacyTasks.status).toBe(200);
    const legacyTasksOut: any = await legacyTasks.json();
    const facadeTasks: any = await agentTask("list", { status: "running" });
    expect(facadeTasks.ok).toBe(true);
    expect((facadeTasks.data ?? []).length).toBe((legacyTasksOut.tasks ?? []).length);

    // Artifacts list + read (create one first via the legacy write path).
    const { ArtifactService } = await import("../server/services/artifactService");
    const created = await ArtifactService.createArtifact({ workspaceId: WS, name: `parity-${Date.now()}`, actor: "user" });
    const legacyList = await app.request(`/api/artifacts?workspaceId=${WS}`);
    const legacyListOut: any = await legacyList.json();
    const facadeList: any = await agentArtifacts("list", { workspaceId: WS });
    expect(facadeList.ok).toBe(true);
    expect((facadeList.data ?? []).length).toBe((legacyListOut.artifacts ?? []).length);

    const legacyRead = await app.request(`/api/artifacts/${created.id}`);
    expect(legacyRead.status).toBe(200);
    const facadeRead: any = await agentArtifacts("read", { artifactId: created.id });
    expect(facadeRead.ok).toBe(true);
    expect((facadeRead.data as any).id).toBe(created.id);

    // Facade agent routes (default surface) serve the same data.
    const agentTasksHttp = await app.request("/api/agent/tasks?status=running");
    expect(agentTasksHttp.status).toBe(200);
    const agentArtifactsHttp = await app.request(`/api/agent/artifacts?workspaceId=${WS}`);
    expect(agentArtifactsHttp.status).toBe(200);
  });

  it("agent tools expose install/rollback/session/task/artifact via the facade", async () => {
    const { install_plugin } = await import("../server/agent/tools/install_plugin");
    const { rollback_plugin } = await import("../server/agent/tools/rollback_plugin");
    const { list_sessions } = await import("../server/agent/tools/list_sessions");
    const { inspect_session } = await import("../server/agent/tools/inspect_session");
    const { list_tasks } = await import("../server/agent/tools/list_tasks");
    const { list_artifacts } = await import("../server/agent/tools/list_artifacts");
    const { read_artifact } = await import("../server/agent/tools/read_artifact");

    // Unknown install fails closed with not_found (no ghost mounts).
    const badInstall: any = await install_plugin.execute(
      { pluginId: "parity-ghost-xyz", workspaceId: WS } as any,
      { step: 1, workspaceId: WS, actor: "agent" } as any
    );
    expect(badInstall.ok).toBe(false);

    // Rollback of an unknown version fails closed.
    const badRollback: any = await rollback_plugin.execute(
      { pluginId: "parity-ghost-xyz", version: "0.0.0", workspaceId: WS } as any,
      { step: 1, workspaceId: WS, actor: "agent" } as any
    );
    expect(badRollback.ok).toBe(false);

    // Read-only inspection tools work through the facade.
    const sessions: any = await list_sessions.execute({}, { step: 1, workspaceId: WS } as any);
    expect(sessions.ok).toBe(true);
    const tasks: any = await list_tasks.execute({ status: "running" } as any, { step: 1, workspaceId: WS } as any);
    expect(tasks.ok).toBe(true);
    const artifacts: any = await list_artifacts.execute({ workspaceId: WS } as any, { step: 1, workspaceId: WS } as any);
    expect(artifacts.ok).toBe(true);

    // inspect_session and read_artifact fail closed on unknown ids.
    const badSession: any = await inspect_session.execute({ sessionId: "no-such-session" } as any, { step: 1, workspaceId: WS } as any);
    expect(badSession.ok).toBe(false);
    const badArtifact: any = await read_artifact.execute({ artifactId: "no-such-artifact" } as any, { step: 1 } as any);
    expect(badArtifact.ok).toBe(false);
  });

  it("legacy routes still mounted (rollback via config preserved)", async () => {
    // Legacy plugin lifecycle route still exists alongside the facade.
    const res = await app.request("/api/plugins/lifecycle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "uninstall", pluginId: "nope", workspaceId: WS }),
    });
    expect([200, 400]).toContain(res.status);
    // Facade dock + agent routes mounted by default; retired routes stay gone.
    expect((await app.request("/api/dock/tabs")).status).toBe(404);
    expect((await app.request("/api/agent/status")).status).toBe(200);
  });
});
