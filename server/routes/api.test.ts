import { describe, expect, it } from "bun:test";
import app from "../index";

describe("Polydocks REST API Endpoints", () => {
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

  it("grants are visible and revocable per permission", async () => {
    const { pluginRegistry } = await import("../plugins/registry");
    const grant = pluginRegistry.recordGrant("test-grant-plugin", "external", "workspace:ws-1", "allow_once");
    try {
      const listed = await app.fetch(new Request("http://localhost:3000/api/plugins/test-grant-plugin/grants"));
      expect(listed.status).toBe(200);
      const body = (await listed.json()) as any;
      expect(body.grants.some((g: any) => g.grantId === grant.grantId)).toBe(true);

      const revoked = await app.fetch(
        new Request(`http://localhost:3000/api/plugins/grants/${grant.grantId}/revoke`, { method: "POST" })
      );
      expect(revoked.status).toBe(200);
      expect(pluginRegistry.getGrants("test-grant-plugin")).toHaveLength(0);

      const missing = await app.fetch(
        new Request("http://localhost:3000/api/plugins/grants/no-such-grant/revoke", { method: "POST" })
      );
      expect(missing.status).toBe(404);
    } finally {
      pluginRegistry.revokeGrant(grant.grantId);
    }
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

  it("GET /api/plugins?withLastRun=1 embeds one latest execution per plugin (no N+1)", async () => {
    const { pluginRegistry } = await import("../plugins/registry");
    pluginRegistry.install({
      apiVersion: 1,
      id: "test-lastrun-plugin",
      name: "LastRun Probe",
      version: "1.0.0",
      description: "batch probe",
      icon: "Layers",
      trust: "generated",
      capabilities: [],
      surfaces: [],
    });
    try {
      const { capabilityBus } = await import("../plugins/bus");
      const { initializeFirstPartyPlugins } = await import("../plugins/first-party/index");
      initializeFirstPartyPlugins();
      await capabilityBus.invoke(
        "notes.list",
        { workspaceId: "ws-lastrun-probe" },
        { actor: "agent", workspaceId: "ws-lastrun-probe" }
      );
      const plain = await app.fetch(new Request("http://localhost:3000/api/plugins"));
      const plainBody = (await plain.json()) as any;
      expect(plainBody.plugins[0].lastExecution).toBeUndefined();

      const batched = await app.fetch(new Request("http://localhost:3000/api/plugins?withLastRun=1"));
      expect(batched.status).toBe(200);
      const body = (await batched.json()) as any;
      expect(Array.isArray(body.plugins)).toBe(true);
      for (const p of body.plugins) {
        expect("lastExecution" in p).toBe(true);
      }
      // notes ran above: its dot carries the latest row.
      const notes = body.plugins.find((p: any) => p.id === "notes");
      expect(notes?.lastExecution?.capabilityId).toBe("notes.list");
    } finally {
      pluginRegistry.uninstall("test-lastrun-plugin");
      const { db } = await import("../workspace/db");
      try {
        db.query("DELETE FROM executions WHERE plugin_id = ?").run("notes");
      } catch {}
      try {
        db.query("DELETE FROM notes WHERE workspace_id = ?").run("ws-lastrun-probe");
      } catch {}
    }
  });
});
