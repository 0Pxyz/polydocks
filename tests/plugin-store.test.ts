import { describe, it, expect, beforeEach } from "bun:test";
import {
  ensureRegistrySchema,
  listRegistryPlugins,
  getRegistryPlugin,
  publishToRegistry,
  installFromRegistry,
} from "../server/plugins/communityRegistry";
import { publish_plugin } from "../server/agent/tools/publish_plugin";
import { create_plugin } from "../server/agent/tools/create_plugin";
import { ensureDefaultWorkspace, createWorkspace, listWorkspacePlugins } from "../server/workspace/workspaces";
import { db } from "../server/workspace/db";

describe("PolyDocks V2 Community Plugin Registry & Store", () => {
  beforeEach(() => {
    ensureDefaultWorkspace();
    ensureRegistrySchema();
    // Clean up test records (workspaces too: createWorkspace has no
    // upsert, so leftovers from a previous run collide on PRIMARY KEY).
    db.query("DELETE FROM workspace_plugins WHERE workspace_id LIKE 'test-%'").run();
    db.query("DELETE FROM workspaces WHERE id LIKE 'test-%'").run();
    db.query("DELETE FROM registry_plugins WHERE id LIKE 'test-%'").run();
    db.query("DELETE FROM workspace_plugins WHERE plugin_id LIKE 'test-%'").run();
    db.query("DELETE FROM plugins WHERE id LIKE 'test-%'").run();
  });

  it("seeds canonical default community plugins if registry is empty", () => {
    const list = listRegistryPlugins();
    expect(list.length).toBeGreaterThanOrEqual(1);
    const pomodoro = list.find((p) => p.id === "pomodoro-focus");
    expect(pomodoro).toBeDefined();
    expect(pomodoro?.name).toBe("Pomodoro Focus");
    expect(pomodoro?.downloads).toBeGreaterThan(0);
  });

  it("filters community plugins by search query and tag", () => {
    const pomodoro = listRegistryPlugins({ search: "Pomodoro" });
    expect(pomodoro.some((p) => p.id === "pomodoro-focus")).toBe(true);

    const timerTag = listRegistryPlugins({ tag: "timer" });
    expect(timerTag.some((p) => p.id === "pomodoro-focus")).toBe(true);

    const nonExistent = listRegistryPlugins({ search: "NonExistentToolXYZ" });
    expect(nonExistent.length).toBe(0);
  });

  it("publishes a synthesized workspace plugin to the registry", async () => {
    // 1. Synthesize a plugin in workspace
    const code = `
      const app = document.getElementById('app');
      app.innerHTML = '<button id="btn">Click me</button>';
    `;
    await create_plugin.execute(
      {
        id: "test-sharable-calc",
        name: "Sharable Calculator",
        description: "A calculator for the community",
        icon: "Calculator",
        code,
        workspaceId: "default",
      },
      { cityId: "default" }
    );

    // 2. Publish to registry
    const pubRes = await publishToRegistry({
      pluginId: "test-sharable-calc",
      workspaceId: "default",
      author: "Alice Developer",
      tags: ["math", "calculator", "utilities"],
    });

    expect(pubRes.success).toBe(true);
    expect(pubRes.item?.id).toBe("test-sharable-calc");
    expect(pubRes.item?.author).toBe("Alice Developer");
    expect(pubRes.item?.tags).toContain("math");

    // 3. Verify in registry list
    const fetched = getRegistryPlugin("test-sharable-calc");
    expect(fetched).not.toBeNull();
    expect(fetched?.name).toBe("Sharable Calculator");
  });

  it("installs a registry plugin into a separate workspace with 1-click", async () => {
    // Create a new target workspace
    createWorkspace({
      id: "test-isolated-ws",
      name: "Isolated Lab",
    });

    // Install pomodoro-focus from registry into this workspace
    const installRes = await installFromRegistry("pomodoro-focus", "test-isolated-ws");
    expect(installRes.success).toBe(true);

    // Verify mounted in target workspace
    const mounted = listWorkspacePlugins("test-isolated-ws");
    expect(mounted.some((p) => p.pluginId === "pomodoro-focus")).toBe(true);

    // Verify downloads incremented
    const updatedPlugin = getRegistryPlugin("pomodoro-focus");
    expect(updatedPlugin?.downloads).toBeGreaterThanOrEqual(49);
  });

  it("agent tool publish_plugin publishes to community registry", async () => {
    // Synthesize plugin
    await create_plugin.execute(
      {
        id: "test-agent-pub-tool",
        name: "Agent Published Tool",
        description: "Created by agent to test publishing",
        code: "const app = document.getElementById('app');",
        workspaceId: "default",
      },
      { cityId: "default" }
    );

    const res = await publish_plugin.execute(
      {
        pluginId: "test-agent-pub-tool",
        workspaceId: "default",
        author: "Agent Spark",
        tags: ["agent-made", "productivity"],
      },
      { cityId: "default" }
    );

    expect(res.success).toBe(true);
    expect(res.pluginId).toBe("test-agent-pub-tool");
    expect(getRegistryPlugin("test-agent-pub-tool")).not.toBeNull();
  });

  it("serves REST API endpoints /api/registry, /publish, and /install", async () => {
    const { default: app } = await import("../server/index");

    // GET /api/registry
    const getRes = await app.fetch(new Request("http://localhost:3000/api/registry"));
    expect(getRes.status).toBe(200);
    const getJson = await getRes.json();
    expect(getJson.success).toBe(true);
    expect(Array.isArray(getJson.data)).toBe(true);

    // POST /api/registry/publish
    await create_plugin.execute(
      {
        id: "test-rest-tool",
        name: "REST Tool",
        description: "Testing REST API publish",
        code: "const app = document.getElementById('app');",
        workspaceId: "default",
      },
      { cityId: "default" }
    );

    const pubRes = await app.fetch(
      new Request("http://localhost:3000/api/registry/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pluginId: "test-rest-tool",
          author: "Tester",
          tags: ["test"],
        }),
      })
    );
    expect(pubRes.status).toBe(201);

    // POST /api/registry/:id/install
    createWorkspace({
      id: "test-rest-dest-ws",
      name: "Destination WS",
    });

    const installRes = await app.fetch(
      new Request("http://localhost:3000/api/registry/test-rest-tool/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: "test-rest-dest-ws",
        }),
      })
    );
    expect(installRes.status).toBe(200);
    const installJson = await installRes.json();
    expect(installJson.success).toBe(true);

    const mounted = listWorkspacePlugins("test-rest-dest-ws");
    expect(mounted.some((p) => p.pluginId === "test-rest-tool")).toBe(true);
  });
});
