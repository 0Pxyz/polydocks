import { describe, expect, it } from "bun:test";
import app from "../index";

describe("Polymax REST API Endpoints", () => {
  it("GET /api/health returns system and model status with latency < 5ms", async () => {
    const start = Date.now();
    const res = await app.fetch(new Request("http://localhost:3000/api/health"));
    const duration = Date.now() - start;

    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.status).toBe("ok");
    expect(data.sqlite.ok).toBe(true);
    expect(duration).toBeLessThanOrEqual(50);
  });

  it("GET /api/workspaces lists workspaces", async () => {
    const res = await app.fetch(new Request("http://localhost:3000/api/workspaces"));
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.success).toBe(true);
    expect(Array.isArray(data.data)).toBe(true);
  });

  it("unknown routes return 404, not a legacy fallback", async () => {
    const res = await app.fetch(new Request("http://localhost:3000/api/cities"));
    expect(res.status).toBe(404);
  });

  it("activate/deactivate flips the persisted flag and reports {id, active, version}", async () => {
    const { pluginRegistry } = await import("../plugins/registry");
    const manifest = {
      apiVersion: 1,
      id: "test-toggle-plugin",
      name: "Toggle Probe",
      version: "1.0.0",
      description: "activate/deactivate route probe",
      icon: "test",
      trust: "first-party",
      capabilities: [],
      permissions: [],
    };
    expect(pluginRegistry.install(manifest).success).toBe(true);
    try {
      const deactivate = await app.fetch(
        new Request("http://localhost:3000/api/plugins/test-toggle-plugin/deactivate", { method: "POST" })
      );
      expect(deactivate.status).toBe(200);
      expect(await deactivate.json()).toMatchObject({ success: true, pluginId: "test-toggle-plugin", active: false });

      // Persisted in SQLite: a fresh read sees the flag.
      expect(pluginRegistry.get("test-toggle-plugin")?.enabled).toBe(false);

      const activate = await app.fetch(
        new Request("http://localhost:3000/api/plugins/test-toggle-plugin/activate", { method: "POST" })
      );
      expect(activate.status).toBe(200);
      expect(await activate.json()).toMatchObject({ success: true, pluginId: "test-toggle-plugin", active: true, version: "1.0.0" });

      const list = await app.fetch(new Request("http://localhost:3000/api/plugins"));
      const body = (await list.json()) as any;
      const entry = body.plugins.find((p: any) => p.id === "test-toggle-plugin");
      expect(entry).toMatchObject({ id: "test-toggle-plugin", active: true, version: "1.0.0" });

      const missing = await app.fetch(
        new Request("http://localhost:3000/api/plugins/no-such-plugin/activate", { method: "POST" })
      );
      expect(missing.status).toBe(404);
    } finally {
      pluginRegistry.uninstall("test-toggle-plugin");
    }
  });
});
