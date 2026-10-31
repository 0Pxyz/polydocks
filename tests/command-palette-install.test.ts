import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import app from "../server/index";
import { pluginRegistry } from "../server/plugins/registry";
import { capabilityBus } from "../server/plugins/bus";
import { db } from "../server/workspace/db";

describe("Command Palette & External Manifest URL Installation (Issue #52)", () => {
  beforeEach(() => {
    db.query("DELETE FROM executions WHERE plugin_id LIKE 'ext_%' OR plugin_id LIKE 'test_%' OR plugin_id = 'remote-weather'").run();
    db.query("DELETE FROM plugin_grants WHERE plugin_id LIKE 'ext_%' OR plugin_id LIKE 'test_%' OR plugin_id = 'remote-weather'").run();
    db.query("DELETE FROM plugins WHERE id LIKE 'ext_%' OR id LIKE 'test_%' OR id = 'remote-weather'").run();
  });

  afterEach(() => {
    db.query("DELETE FROM executions WHERE plugin_id LIKE 'ext_%' OR plugin_id LIKE 'test_%' OR plugin_id LIKE 'remote-weather'").run();
    db.query("DELETE FROM plugin_grants WHERE plugin_id LIKE 'ext_%' OR plugin_id LIKE 'test_%' OR plugin_id LIKE 'remote-weather'").run();
    db.query("DELETE FROM plugins WHERE id LIKE 'ext_%' OR id LIKE 'test_%' OR id = 'remote-weather'").run();
  });

  describe("Capability Catalog & User-Level Invocation", () => {
    it("returns enabled capabilities for Command Palette via GET /api/capabilities", async () => {
      const res = await app.fetch(new Request("http://localhost:3000/api/capabilities?enabled=true"));
      expect(res.status).toBe(200);

      const data = (await res.json()) as any;
      expect(Array.isArray(data.capabilities)).toBe(true);
      expect(data.capabilities.length).toBeGreaterThan(0);

      // Verify each capability contains necessary fields for the Command Palette
      const first = data.capabilities[0];
      expect(typeof first.id).toBe("string");
      expect(typeof first.pluginId).toBe("string");
      expect(typeof first.title).toBe("string");
      expect(typeof first.risk).toBe("string");
    });

    it("triggers user-level capability invocation via POST /api/capabilities/invoke", async () => {
      // Register a temporary test capability
      const testPluginId = "test_user_invoker";
      pluginRegistry.install({
        apiVersion: 1,
        id: testPluginId,
        name: "Test User Invoker",
        version: "1.0.0",
        description: "Test plugin for user-level invocation",
        icon: "Terminal",
        trust: "first-party",
        capabilities: [
          {
            id: `${testPluginId}.ping`,
            title: "Ping Service",
            description: "Returns pong",
            risk: "read",
            input: { type: "object" },
          },
        ],
        permissions: [],
      });

      capabilityBus.register(testPluginId, {
        id: `${testPluginId}.ping`,
        title: "Ping Service",
        description: "Returns pong",
        risk: "read",
        input: { type: "object" },
      }, async () => ({ pong: true, timestamp: Date.now() }));

      const invokeRes = await app.fetch(
        new Request("http://localhost:3000/api/capabilities/invoke", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            capabilityId: `${testPluginId}.ping`,
            input: {},
          }),
        })
      );

      expect(invokeRes.status).toBe(200);
      const data = (await invokeRes.json()) as any;
      expect(data.success).toBe(true);
      expect(data.data.pong).toBe(true);
      expect(data.capabilityId).toBe(`${testPluginId}.ping`);

      // Verify invocation via parameter URL POST /api/capabilities/:id/invoke
      const paramRes = await app.fetch(
        new Request(`http://localhost:3000/api/capabilities/${testPluginId}.ping/invoke`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input: {} }),
        })
      );

      expect(paramRes.status).toBe(200);
      const paramData = (await paramRes.json()) as any;
      expect(paramData.success).toBe(true);
      expect(paramData.data.pong).toBe(true);
    });

    it("fails gracefully when invoking nonexistent or invalid capability", async () => {
      const res = await app.fetch(
        new Request("http://localhost:3000/api/capabilities/invoke", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            capabilityId: "nonexistent.capability.id",
            input: {},
          }),
        })
      );

      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.success).toBe(false);
      expect(data.error).toContain("not found in registry");
    });
  });

  describe("Remote Manifest URL install was removed (no UI or API path)", () => {
    it("POST /api/plugins/install-url no longer exists", async () => {
      const res = await app.fetch(
        new Request("http://localhost:3000/api/plugins/install-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: "https://example.com/plugins/my-tool/plugin.json" }),
        })
      );
      // Gone: the route is unregistered, so Hono falls through to the
      // capability-invoke route (missing capability) or 404 — never an install.
      expect([400, 404]).toContain(res.status);
      const data = (await res.json().catch(() => null)) as any;
      const text = JSON.stringify(data ?? {});
      expect(text).not.toContain("requiresConfirmation");
      expect(text).not.toContain("pluginId");
    });
  });
});
