import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";
import { initAgentHome } from "../server/system/agentHome";
import {
  WorkspaceService,
  SessionService,
  TaskService,
  PluginService,
  ArtifactService,
  getAuditLogs,
} from "../server/services";
import { create_plugin } from "../server/agent/tools/create_plugin";
import { modify_plugin } from "../server/agent/tools/modify_plugin";
import { publish_plugin } from "../server/agent/tools/publish_plugin";
import app from "../server/index";

import { db } from "../server/workspace/db";

describe("Unified Product API & Shared Service Layer (Issue #77)", () => {
  const TEST_ROOT = path.resolve(process.cwd(), "test-unified-api-fixture");
  const originalEnv = process.env.AGENT_HOME_DIR;

  function cleanupDb() {
    db.query("DELETE FROM workspace_plugins WHERE workspace_id LIKE 'test-%'").run();
    db.query("DELETE FROM workspaces WHERE id LIKE 'test-%'").run();
    db.query("DELETE FROM artifacts WHERE workspace_id LIKE 'test-%'").run();
    db.query("DELETE FROM plugins WHERE id LIKE 'test-%' OR id LIKE 'idemp-%' OR id = 'shared-app'").run();
  }

  beforeEach(async () => {
    process.env.AGENT_HOME_DIR = TEST_ROOT;
    cleanupDb();
    await fs.rm(TEST_ROOT, { recursive: true, force: true }).catch(() => {});
    await initAgentHome(TEST_ROOT);
  });

  afterEach(async () => {
    cleanupDb();
    if (originalEnv !== undefined) {
      process.env.AGENT_HOME_DIR = originalEnv;
    } else {
      delete process.env.AGENT_HOME_DIR;
    }
    await fs.rm(TEST_ROOT, { recursive: true, force: true }).catch(() => {});
  });

  describe("WorkspaceService & REST API Parity", () => {
    it("creates, updates, and lists workspaces with audit log tracking", async () => {
      const ws = await WorkspaceService.createWorkspace({
        id: "test-ws-quantum",
        name: "Quantum Dynamics",
        description: "Frontier physics and tensor networks",
        icon: "Atom",
        actor: "user",
      });

      expect(ws.name).toBe("Quantum Dynamics");
      expect(ws.icon).toBe("Atom");

      const fetched = WorkspaceService.getWorkspace(ws.id);
      expect(fetched?.name).toBe("Quantum Dynamics");

      // Verify audit log has user attribution
      const logs = getAuditLogs({ action: "workspace.create", targetId: ws.id });
      expect(logs.length).toBeGreaterThanOrEqual(1);
      expect(logs[0].actor).toBe("user");
      expect(logs[0].details?.name).toBe("Quantum Dynamics");

      // Update via service
      const updated = WorkspaceService.updateWorkspace(ws.id, {
        description: "Updated description",
        actor: "agent",
      });
      expect(updated?.description).toBe("Updated description");

      const updateLogs = getAuditLogs({ action: "workspace.update", targetId: ws.id });
      expect(updateLogs.length).toBeGreaterThanOrEqual(1);
      expect(updateLogs[0].actor).toBe("agent");
    });

    it("REST API POST /api/workspaces invokes WorkspaceService and records audit log", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/workspaces", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: "test-ws-neural",
            name: "Neural Systems",
            icon: "Brain",
          }),
        })
      );

      expect(res.status).toBe(201);
      const json = (await res.json()) as any;
      expect(json.data.name).toBe("Neural Systems");

      const logs = getAuditLogs({ action: "workspace.create", targetId: json.data.id });
      expect(logs.length).toBeGreaterThanOrEqual(1);
      expect(logs[0].actor).toBe("user");
    });

    it("SessionService and TaskService integrate cleanly with audit logging", async () => {
      const session = await SessionService.createSession({
        workspaceId: "test-ws-shared",
        title: "Shared Session Test",
        actor: "agent",
      });
      expect(session.id).toBeTruthy();

      const task = await TaskService.createTask({
        sessionId: session.id,
        workspaceId: "test-ws-shared",
        type: "chat",
        actor: "agent",
      });
      expect(task.id).toBeTruthy();

      const taskLogs = getAuditLogs({ action: "task.create", targetId: task.id });
      expect(taskLogs.length).toBeGreaterThanOrEqual(1);
      expect(taskLogs[0].actor).toBe("agent");
    });
  });

  describe("Idempotency Deduplication across Services & Tools", () => {
    it("returns cached output on repeated requests with same idempotencyKey without duplicating records", async () => {
      const idempotencyKey = "test-idemp-workspace-key-100";

      const firstCall = await WorkspaceService.createWorkspace({
        id: "test-ws-idemp",
        name: "Idempotent Lab",
        icon: "Shield",
        idempotencyKey,
      });

      // Repeat call with identical key
      const secondCall = await WorkspaceService.createWorkspace({
        id: "test-ws-idemp",
        name: "Idempotent Lab Changed Name",
        icon: "Shield",
        idempotencyKey,
      });

      expect(secondCall.id).toBe(firstCall.id);
      expect(secondCall.name).toBe("Idempotent Lab"); // Returned cached result!
      expect(secondCall.createdAt).toBe(firstCall.createdAt);

      // Verify only ONE audit log was created for this key
      const logs = getAuditLogs({ action: "workspace.create", targetId: firstCall.id });
      expect(logs.length).toBe(1);
    });

    it("create_plugin tool supports idempotency key to prevent duplicate synthesis", async () => {
      const key = "test-idemp-plugin-key-200";
      const code = `
        const root = document.getElementById('app');
        if (root) { root.innerHTML = '<div id="timer">Timer v1</div>'; }
      `;

      const res1 = (await create_plugin.execute(
        {
          id: "idemp-timer",
          name: "Idempotent Timer",
          description: "A test timer",
          code,
          workspaceId: "default",
          idempotencyKey: key,
        },
        { cityId: "default", step: 1 }
      )) as any;

      expect(res1.success).toBe(true);

      // Second invocation via tool with same key
      const res2 = (await create_plugin.execute(
        {
          id: "idemp-timer",
          name: "Idempotent Timer Modified",
          description: "A test timer",
          code,
          workspaceId: "default",
          idempotencyKey: key,
        },
        { cityId: "default", step: 2 }
      )) as any;

      expect(res2.success).toBe(true);
      expect(res2.name).toBe("Idempotent Timer");

      // Verify audit logs for plugin.synthesize
      const logs = getAuditLogs({ action: "plugin.synthesize", targetId: "idemp-timer" });
      expect(logs.length).toBe(1);
      expect(logs[0].actor).toBe("agent");
    });
  });

  describe("PluginService, Modify & Publish Parity", () => {
    it("modifies and publishes plugin through PluginService with agent attribution", async () => {
      const code = `
        const root = document.getElementById('app');
        if (root) { root.innerHTML = '<div>App v1</div>'; }
      `;

      // 1. Synthesize
      const syn = await PluginService.synthesizePlugin({
        id: "shared-app",
        name: "Shared App",
        description: "Shared app description",
        code,
        workspaceId: "default",
        actor: "agent",
      });
      expect(syn.success).toBe(true);

      // 2. Modify via modify_plugin tool
      const updatedCode = `
        const root = document.getElementById('app');
        if (root) { root.innerHTML = '<div>App v2</div>'; }
      `;
      const modRes = (await modify_plugin.execute(
        {
          id: "shared-app",
          code: updatedCode,
          changeSummary: "Updated to version 2",
          workspaceId: "default",
        },
        { cityId: "default", step: 2 }
      )) as any;

      expect(modRes.success).toBe(true);
      expect(modRes.version).toBe("1.0.1");

      const modLogs = getAuditLogs({ action: "plugin.modify", targetId: "shared-app" });
      expect(modLogs.length).toBeGreaterThanOrEqual(1);
      expect(modLogs[0].actor).toBe("agent");

      // 3. Publish via publish_plugin tool
      const pubRes = (await publish_plugin.execute(
        {
          pluginId: "shared-app",
          workspaceId: "default",
          author: "Polymax Agent",
          tags: ["utility"],
        },
        { cityId: "default", step: 3 }
      )) as any;

      expect(pubRes.success).toBe(true);
      const pubLogs = getAuditLogs({ action: "plugin.publish", targetId: "shared-app" });
      expect(pubLogs.length).toBeGreaterThanOrEqual(1);
      expect(pubLogs[0].actor).toBe("agent");
    });
  });

  describe("ArtifactService & REST API", () => {
    it("creates, retrieves, and lists artifacts in workspace", async () => {
      const art = await ArtifactService.createArtifact({
        workspaceId: "ws-arts",
        name: "Quantum Roadmap Diagram",
        type: "diagram",
        content: "graph TD; A-->B;",
        actor: "agent",
      });

      expect(art.id).toBeTruthy();
      expect(art.name).toBe("Quantum Roadmap Diagram");

      const fetched = ArtifactService.getArtifact(art.id);
      expect(fetched?.name).toBe("Quantum Roadmap Diagram");

      const list = ArtifactService.listArtifacts("ws-arts");
      expect(list.some((a) => a.id === art.id)).toBe(true);

      const logs = getAuditLogs({ action: "artifact.create", targetId: art.id });
      expect(logs.length).toBeGreaterThanOrEqual(1);
      expect(logs[0].actor).toBe("agent");
    });

    it("REST API /api/artifacts supports GET and POST", async () => {
      const createRes = await app.fetch(
        new Request("http://localhost/api/artifacts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId: "ws-art-api",
            name: "Research Synthesis Report",
            type: "document",
            content: "# Stoicism Foundations",
          }),
        })
      );

      expect(createRes.status).toBe(201);
      const data = (await createRes.json()) as any;
      expect(data.artifact.name).toBe("Research Synthesis Report");

      const listRes = await app.fetch(
        new Request("http://localhost/api/artifacts?workspaceId=ws-art-api")
      );
      expect(listRes.status).toBe(200);
      const listData = (await listRes.json()) as any;
      expect(listData.artifacts.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Security: Audit Log Secret Redaction", () => {
    it("automatically redacts sensitive tokens in audit log payloads", async () => {
      await WorkspaceService.createWorkspace({
        id: "test-ws-secret",
        name: "Secret Workspace",
        description: "Created with bearer token: Bearer abcdef1234567890abcdef and sk-secret12345678901234567890",
        actor: "agent",
      });

      const logs = getAuditLogs({ action: "workspace.create" });
      const targetLog = logs.find((l) => l.details?.name === "Secret Workspace");
      expect(targetLog).toBeTruthy();
      const desc = String(targetLog?.details?.description || "");

      expect(desc).not.toContain("abcdef1234567890abcdef");
      expect(desc).not.toContain("sk-secret12345678901234567890");
      expect(desc).toContain("[REDACTED_SECRET]");
    });
  });

  describe("Backward Compatibility", () => {
    it("existing V1 routes (/api/health, /api/cities, /api/maps) remain functional", async () => {
      const healthRes = await app.fetch(new Request("http://localhost/api/health"));
      expect(healthRes.status).toBe(200);
      const health = (await healthRes.json()) as any;
      expect(health.status).toBe("ok");

      const citiesRes = await app.fetch(new Request("http://localhost/api/cities"));
      expect(citiesRes.status).toBe(200);

      const mapsRes = await app.fetch(new Request("http://localhost/api/maps"));
      expect(mapsRes.status).toBe(200);
    });
  });
});
