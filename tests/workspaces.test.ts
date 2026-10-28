import { describe, it, expect, beforeEach } from "bun:test";
import {
  ensureDefaultWorkspace,
  listWorkspaces,
  getWorkspace,
  createWorkspace,
  updateWorkspace,
  deleteWorkspace,
  listWorkspacePlugins,
  addPluginToWorkspace,
  removePluginFromWorkspace,
  setWorkspacePluginStatus,
} from "../server/workspace/workspaces";
import { db } from "../server/workspace/db";
import { PluginRegistry } from "../server/plugins/registry";
import type { PluginManifest } from "../server/plugins/manifest";

describe("PolyDocks V2 Multi-Workspace Scoping & Data Model", () => {
  beforeEach(() => {
    // Purge test workspace entries
    db.query("DELETE FROM workspace_plugins WHERE workspace_id LIKE 'test-%'").run();
    db.query("DELETE FROM workspaces WHERE id LIKE 'test-%'").run();
  });

  it("ensures default workspace is automatically created if absent", () => {
    const ws = ensureDefaultWorkspace();
    expect(ws).toBeDefined();
    expect(ws.id).toBeDefined();
    expect(ws.name).toBe("Focus Hub");
    expect(ws.isDefault).toBe(true);

    const list = listWorkspaces();
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list.some((w) => w.id === ws.id)).toBe(true);
  });

  it("creates, retrieves, and updates custom workspaces", () => {
    const created = createWorkspace({
      id: "test-workspace-alpha",
      name: "Deep Learning Research",
      description: "Dedicated workspace for PyTorch and Transformers exploration",
      icon: "Brain",
    });

    expect(created.id).toBe("test-workspace-alpha");
    expect(created.name).toBe("Deep Learning Research");
    expect(created.icon).toBe("Brain");

    const fetched = getWorkspace("test-workspace-alpha");
    expect(fetched).not.toBeNull();
    expect(fetched?.name).toBe("Deep Learning Research");

    const updated = updateWorkspace("test-workspace-alpha", {
      name: "Neural Networks Lab",
      description: "Updated description",
    });
    expect(updated?.name).toBe("Neural Networks Lab");
    expect(updated?.description).toBe("Updated description");
  });

  it("deletes non-default workspaces but protects default workspace", () => {
    createWorkspace({
      id: "test-workspace-temp",
      name: "Temporary Scratchpad",
    });

    const deleteTemp = deleteWorkspace("test-workspace-temp");
    expect(deleteTemp.success).toBe(true);
    expect(getWorkspace("test-workspace-temp")).toBeNull();

    const defaultWs = ensureDefaultWorkspace();
    const deleteDefault = deleteWorkspace(defaultWs.id);
    expect(deleteDefault.success).toBe(false);
    expect(deleteDefault.error).toContain("default workspace");
  });

  it("mounts, lists, toggles, and unmounts workspace plugins", () => {
    // Register mock plugin first
    const registry = PluginRegistry.getInstance();
    const manifest: PluginManifest = {
      apiVersion: 1,
      id: "test-timer",
      name: "Test Timer",
      version: "1.0.0",
      description: "A test timer plugin",
      icon: "Clock",
      trust: "first-party",
      capabilities: [],
      surfaces: [],
      permissions: [],
    };
    registry.install(manifest);

    createWorkspace({
      id: "test-ws-tools",
      name: "Productivity",
    });

    const mounted = addPluginToWorkspace("test-ws-tools", "test-timer", { autoStart: true }, 1);
    expect(mounted.workspaceId).toBe("test-ws-tools");
    expect(mounted.pluginId).toBe("test-timer");
    expect(mounted.enabled).toBe(true);
    expect(mounted.position).toBe(1);

    const list = listWorkspacePlugins("test-ws-tools");
    expect(list.length).toBe(1);
    expect(list[0].pluginId).toBe("test-timer");
    expect(list[0].plugin?.name).toBe("Test Timer");

    const toggle = setWorkspacePluginStatus("test-ws-tools", "test-timer", false);
    expect(toggle).toBe(true);
    const updatedList = listWorkspacePlugins("test-ws-tools");
    expect(updatedList[0].enabled).toBe(false);

    const removed = removePluginFromWorkspace("test-ws-tools", "test-timer");
    expect(removed).toBe(true);
    expect(listWorkspacePlugins("test-ws-tools").length).toBe(0);

    // Clean up
    registry.uninstall("test-timer");
  });

  describe("Workspaces REST API Endpoints", () => {
    it("handles GET /api/workspaces and POST /api/workspaces", async () => {
      const { default: app } = await import("../server/index");

      const getRes = await app.fetch(new Request("http://localhost:3000/api/workspaces"));
      expect(getRes.status).toBe(200);
      const getJson = await getRes.json();
      expect(getJson.success).toBe(true);
      expect(Array.isArray(getJson.data)).toBe(true);

      const postRes = await app.fetch(
        new Request("http://localhost:3000/api/workspaces", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: "test-api-ws",
            name: "API Test Workspace",
            description: "Testing API",
            icon: "Terminal",
          }),
        })
      );
      expect(postRes.status).toBe(201);
      const postJson = await postRes.json();
      expect(postJson.success).toBe(true);
      expect(postJson.data.id).toBe("test-api-ws");

      // Verify plugin mounting route
      const mountRes = await app.fetch(
        new Request("http://localhost:3000/api/workspaces/test-api-ws/plugins", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pluginId: "browser",
          }),
        })
      );
      expect(mountRes.status).toBe(201);

      const pluginsRes = await app.fetch(
        new Request("http://localhost:3000/api/workspaces/test-api-ws/plugins")
      );
      expect(pluginsRes.status).toBe(200);
      const pluginsJson = await pluginsRes.json();
      expect(pluginsJson.count).toBe(1);
    });
  });
});
