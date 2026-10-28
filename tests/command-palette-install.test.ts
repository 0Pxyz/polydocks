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

  describe("Install Plugin from Remote Manifest URL (POST /api/plugins/install-url)", () => {
    it("strictly blocks SSRF attempts to private networks and loopback interfaces", async () => {
      const blockedUrls = [
        "http://127.0.0.1:8080/plugin.json",
        "http://localhost:3000/plugin.json",
        "http://169.254.169.254/latest/meta-data",
        "http://10.0.0.1/plugin.json",
        "http://192.168.1.1/plugin.json",
      ];

      for (const url of blockedUrls) {
        const res = await app.fetch(
          new Request("http://localhost:3000/api/plugins/install-url", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url }),
          })
        );

        expect(res.status).toBe(400);
        const data = (await res.json()) as any;
        expect(data.error).toContain("SSRF Guard Blocked");
      }
    });

    it("prompts with manifest inspection and required permissions when permissionsConfirmed is false", async () => {
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = (async (input: any) => {
          if (String(input).includes("weather-plugin.org/plugin.json")) {
            return new Response(
              JSON.stringify({
                apiVersion: 1,
                id: "remote-weather",
                name: "Remote Weather Service",
                version: "1.0.0",
                description: "Live weather forecasts and satellite radar",
                icon: "CloudSun",
                trust: "external",
                permissions: [
                  { type: "net", hosts: ["api.weather.com"] },
                ],
                capabilities: [
                  {
                    id: "remote-weather.get",
                    title: "Get Weather",
                    description: "Fetch live temperature and radar",
                    risk: "read",
                    input: { type: "object" },
                  },
                ],
              }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            );
          }
          return new Response("Not found", { status: 404 });
        }) as typeof fetch;

        const inspectRes = await app.fetch(
          new Request("http://localhost:3000/api/plugins/install-url", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              url: "https://weather-plugin.org/plugin.json",
              permissionsConfirmed: false,
            }),
          })
        );

        expect(inspectRes.status).toBe(200);
        const inspectData = (await inspectRes.json()) as any;
        expect(inspectData.requiresConfirmation).toBe(true);
        expect(inspectData.manifest.id).toBe("remote-weather");
        expect(inspectData.permissions[0].type).toBe("net");
        expect(inspectData.permissions[0].hosts).toEqual(["api.weather.com"]);

        // Plugin should NOT yet be installed in SQLite registry
        expect(pluginRegistry.has("remote-weather")).toBe(false);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("completes installation and grants permissions when permissionsConfirmed is true", async () => {
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = (async (input: any) => {
          if (String(input).includes("weather-plugin.org/plugin.json")) {
            return new Response(
              JSON.stringify({
                apiVersion: 1,
                id: "remote-weather",
                name: "Remote Weather Service",
                version: "1.0.0",
                description: "Live weather forecasts and satellite radar",
                icon: "CloudSun",
                trust: "external",
                permissions: [
                  { type: "net", hosts: ["api.weather.com"] },
                ],
                capabilities: [
                  {
                    id: "remote-weather.get",
                    title: "Get Weather",
                    description: "Fetch live temperature and radar",
                    risk: "read",
                    input: { type: "object" },
                  },
                ],
              }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            );
          }
          return new Response("Not found", { status: 404 });
        }) as typeof fetch;

        const installRes = await app.fetch(
          new Request("http://localhost:3000/api/plugins/install-url", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              url: "https://weather-plugin.org/plugin.json",
              permissionsConfirmed: true,
            }),
          })
        );

        expect(installRes.status).toBe(201);
        const installData = (await installRes.json()) as any;
        expect(installData.success).toBe(true);
        expect(installData.plugin.id).toBe("remote-weather");

        // Verify plugin is now persisted and active
        const installed = pluginRegistry.get("remote-weather");
        expect(installed).not.toBeNull();
        expect(installed?.enabled).toBe(true);

        // Verify capability is registered on bus
        const cap = capabilityBus.getCapability("remote-weather.get");
        expect(cap).not.toBeNull();
        expect(cap?.title).toBe("Get Weather");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("rejects invalid or malformed plugin manifests", async () => {
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = (async () => {
          return new Response(
            JSON.stringify({
              // Missing apiVersion, id, etc.
              name: "Broken Plugin",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }) as typeof fetch;

        const res = await app.fetch(
          new Request("http://localhost:3000/api/plugins/install-url", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              url: "https://example.com/broken/plugin.json",
            }),
          })
        );

        expect(res.status).toBe(400);
        const data = (await res.json()) as any;
        expect(data.error).toContain("Invalid plugin manifest");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
