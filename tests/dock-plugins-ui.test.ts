import { describe, it, expect, beforeEach, afterEach } from "vitest";
import app from "../server/index";
import { pluginRegistry } from "../server/plugins/registry";
import { capabilityBus } from "../server/plugins/bus";
import { approvalManager } from "../server/plugins/approval";
import { resolveSurfaceIcon, surfaceToDockTool } from "../src/features/dock/surfaceResolver";
import { db } from "../server/workspace/db";
import { z } from "zod";

describe("Plugins Dock Tool & Lifecycle UI (Issue #48)", () => {
  const testPluginId = "test_lifecycle_plugin";

  beforeEach(() => {
    db.query("DELETE FROM plugin_grants WHERE plugin_id LIKE 'test_%' OR plugin_id LIKE 'mcp_%'").run();
    db.query("DELETE FROM plugins WHERE id LIKE 'test_%' OR id LIKE 'mcp_%'").run();
    db.query("DELETE FROM executions WHERE plugin_id LIKE 'test_%' OR plugin_id LIKE 'mcp_%'").run();
    approvalManager.clear();
  });

  afterEach(() => {
    db.query("DELETE FROM plugin_grants WHERE plugin_id LIKE 'test_%' OR plugin_id LIKE 'mcp_%'").run();
    db.query("DELETE FROM plugins WHERE id LIKE 'test_%' OR id LIKE 'mcp_%'").run();
    db.query("DELETE FROM executions WHERE plugin_id LIKE 'test_%' OR plugin_id LIKE 'mcp_%'").run();
    approvalManager.clear();
  });

  describe("Plugin Management API Endpoints", () => {
    it("toggles plugin enabled state via POST /api/plugins/:id/toggle", async () => {
      pluginRegistry.install({
        apiVersion: 1,
        id: testPluginId,
        name: "Test Lifecycle Plugin",
        version: "1.0.0",
        description: "Testing toggle",
        icon: "PuzzlePiece",
        trust: "first-party",
        capabilities: [],
        permissions: [],
      });

      expect(pluginRegistry.get(testPluginId)?.enabled).toBe(true);

      // Disable via toggle endpoint
      const toggleRes = await app.fetch(
        new Request(`http://localhost:3000/api/plugins/${testPluginId}/toggle`, {
          method: "POST",
        })
      );
      expect(toggleRes.status).toBe(200);
      const toggleData = (await toggleRes.json()) as any;
      expect(toggleData.enabled).toBe(false);
      expect(pluginRegistry.get(testPluginId)?.enabled).toBe(false);

      // Re-enable via toggle endpoint
      const reenableRes = await app.fetch(
        new Request(`http://localhost:3000/api/plugins/${testPluginId}/toggle`, {
          method: "POST",
        })
      );
      expect(reenableRes.status).toBe(200);
      const reenableData = (await reenableRes.json()) as any;
      expect(reenableData.enabled).toBe(true);
      expect(pluginRegistry.get(testPluginId)?.enabled).toBe(true);
    });

    it("uninstalls non-core plugins and blocks uninstall of core plugins via DELETE /api/plugins/:id", async () => {
      // 1. External/first-party plugin
      pluginRegistry.install({
        apiVersion: 1,
        id: "test_removable_plugin",
        name: "Removable Plugin",
        version: "1.0.0",
        description: "Can be removed",
        icon: "Trash",
        trust: "external",
        capabilities: [],
        permissions: [],
      });

      const delRes = await app.fetch(
        new Request("http://localhost:3000/api/plugins/test_removable_plugin", {
          method: "DELETE",
        })
      );
      expect(delRes.status).toBe(200);
      expect(pluginRegistry.has("test_removable_plugin")).toBe(false);

      // 2. Core plugin uninstall rejection
      pluginRegistry.install({
        apiVersion: 1,
        id: "test_core_guard_plugin",
        name: "Core Guard",
        version: "1.0.0",
        description: "Cannot be removed",
        icon: "ShieldCheck",
        trust: "core",
        capabilities: [],
        permissions: [],
      });

      const coreDelRes = await app.fetch(
        new Request("http://localhost:3000/api/plugins/test_core_guard_plugin", {
          method: "DELETE",
        })
      );
      expect(coreDelRes.status).toBe(400);
      expect(pluginRegistry.has("test_core_guard_plugin")).toBe(true);
    });

    it("connects an external MCP server via POST /api/plugins/mcp/connect", async () => {
      const connectRes = await app.fetch(
        new Request("http://localhost:3000/api/plugins/mcp/connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Postgres Remote",
            url: "https://mcp.postgres.internal/sse",
            token: "secret_remote_token",
            confirmed: true,
          }),
        })
      );

      expect(connectRes.status).toBe(201);
      const data = (await connectRes.json()) as any;
      expect(data.success).toBe(true);
      expect(data.plugin.id).toBe("mcp_postgres_remote");
      expect(data.plugin.trust).toBe("external");
      expect(data.plugin.manifest.capabilities[0].id).toBe("mcp_postgres_remote.invoke");

      // Verify plugin was persisted in SQLite
      const installed = pluginRegistry.get("mcp_postgres_remote");
      expect(installed).not.toBeNull();
      expect(installed?.name).toBe("Postgres Remote");
    });

    it("rejects unconfirmed MCP connect with approval_required (install policy)", async () => {
      const deniedRes = await app.fetch(
        new Request("http://localhost:3000/api/plugins/mcp/connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "No Consent", url: "https://mcp.example.com/sse" }),
        })
      );
      expect(deniedRes.status).toBe(400);
      const denied = (await deniedRes.json()) as any;
      expect(denied.ok).toBe(false);
      expect(denied.code).toBe("approval_required");
      expect(pluginRegistry.get("mcp_no_consent")).toBeNull();
    });

    it("returns recent execution status dots via GET /api/plugins/:id/executions", async () => {
      const execPluginId = "test_exec_plugin";
      pluginRegistry.install({
        apiVersion: 1,
        id: execPluginId,
        name: "Exec Plugin",
        version: "1.0.0",
        description: "Exec log test",
        icon: "Sparkle",
        trust: "first-party",
        capabilities: [
          {
            id: `${execPluginId}.run`,
            title: "Run",
            description: "Run test",
            risk: "read",
            input: z.object({}),
          },
        ],
      });

      capabilityBus.register(execPluginId, {
        id: `${execPluginId}.run`,
        title: "Run",
        description: "Run test",
        risk: "read",
        input: z.object({}),
      }, async () => ({ status: "ok" }));

      // Run capability twice
      await capabilityBus.invoke(`${execPluginId}.run`, {}, { actor: "user" });
      await capabilityBus.invoke(`${execPluginId}.run`, {}, { actor: "user" });

      const execRes = await app.fetch(
        new Request(`http://localhost:3000/api/plugins/${execPluginId}/executions?limit=5`)
      );
      expect(execRes.status).toBe(200);
      const execData = (await execRes.json()) as any;
      expect(Array.isArray(execData.executions)).toBe(true);
      expect(execData.executions.length).toBe(2);
      expect(execData.executions[0].status).toBe("success");
    });
  });

  describe("Surface Resolution & Icon Catalog", () => {
    it("resolves PlugsConnected, PuzzlePiece, and ShieldCheck icons", () => {
      expect(resolveSurfaceIcon("PlugsConnected")).toBeDefined();
      expect(resolveSurfaceIcon("PuzzlePiece")).toBeDefined();
      expect(resolveSurfaceIcon("ShieldCheck")).toBeDefined();
    });

    it("resolves a plugin surface manifest into a DockToolItem", () => {
      const tool = surfaceToDockTool({
        id: "plugins",
        title: "Plugins & Extensions",
        icon: "PlugsConnected",
        variant: "sheet",
        entry: "plugins",
      });

      expect(tool.id).toBe("plugins");
      expect(tool.label).toBe("Plugins & Extensions");
      expect(tool.icon).toBeDefined();
    });
  });

  describe("Inline Approval Card Workflow", () => {
    it("approves pending capability request via REST approval endpoint", async () => {
      const apprPromise = approvalManager.requestApproval({
        pluginId: "test_approval_plugin",
        capabilityId: "test_approval_plugin.delete_file",
        risk: "destructive",
        scope: "workspace:test-ws",
        summary: "Delete a workspace file",
        timeoutMs: 5000,
      });

      const pending = approvalManager.listPending();
      expect(pending.length).toBe(1);
      const item = pending[0];

      // Simulate InlineApprovalCard clicking "Allow Once"
      const res = await app.fetch(
        new Request(`http://localhost:3000/api/capabilities/approvals/${item.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision: "allow_once" }),
        })
      );

      expect(res.status).toBe(200);
      const decision = await apprPromise;
      expect(decision).toBe("allow_once");
    });

    it("denies pending capability request via REST approval endpoint", async () => {
      const apprPromise = approvalManager.requestApproval({
        pluginId: "test_approval_plugin",
        capabilityId: "test_approval_plugin.wipe",
        risk: "destructive",
        scope: "workspace:test-ws",
        summary: "Wipe all workspace files",
        timeoutMs: 5000,
      });

      const pending = approvalManager.listPending();
      expect(pending.length).toBe(1);
      const item = pending[0];

      // Simulate InlineApprovalCard clicking "Deny"
      const res = await app.fetch(
        new Request(`http://localhost:3000/api/capabilities/approvals/${item.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision: "deny" }),
        })
      );

      expect(res.status).toBe(200);
      const decision = await apprPromise;
      expect(decision).toBe("deny");
    });
  });
});
