import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { db } from "../server/workspace/db";
import { DEFAULT_PINNED_IDS, migratePinnedIds } from "../src/lib/dock/dockModel";
import { HOME_DOCK_TOOLS } from "../src/features/dock/AgenticDock";
import { app } from "../server/index";
import { installFromRegistry } from "../server/plugins/communityRegistry";
import { WorkspaceService } from "../server/services/workspaceService";
import { TinyFishError } from "../server/discovery/tinyfish";

const WS = "test-simplification-ws";
const PLUGIN = "pomodoro-focus";

/**
 * Product simplification: core dock, Discover catalog, real data only.
 * Fixtures use test-* ids and clean up after themselves so the shared
 * database (and the live demo) is never polluted.
 */
describe("Product simplification — core dock and Discover", () => {
  beforeAll(() => {
    db.query("DELETE FROM workspace_plugins WHERE workspace_id = ?").run(WS);
    db.query("DELETE FROM dock_pins WHERE workspace_id = ?").run(WS);
  });

  afterAll(() => {
    db.query("DELETE FROM workspace_plugins WHERE workspace_id = ?").run(WS);
    db.query("DELETE FROM dock_pins WHERE workspace_id = ?").run(WS);
    db.query("DELETE FROM workspaces WHERE id = ?").run(WS);
  });

  it("fresh workspace pins the curated core", () => {
    expect(DEFAULT_PINNED_IDS).toEqual(["agent", "browser", "plugins", "creations", "store", "settings"]);
    const homeIds = HOME_DOCK_TOOLS.map((t) => t.id);
    expect(homeIds).toEqual(["agent", "browser", "plugins", "creations", "store", "settings"]);
    expect(new Set(homeIds).size).toBe(6);
  });

  it("existing user pins are preserved, retired tools migrate out", () => {
    expect(migratePinnedIds(["agent", "browser", "plugins", "creations", "store", "settings"])).toEqual([
      "agent",
      "browser",
      "plugins",
      "creations",
      "store",
      "settings",
    ]);
    // Retired knowledge-map ids drop out; everything else survives.
    expect(migratePinnedIds(["agent", "maps", "settings"])).toEqual(["agent", "settings"]);
  });

  it("Discover catalog lists the real registry seed (no mocks)", async () => {
    const res = await app.request("/api/registry");
    expect(res.status).toBe(200);
    const out = (await res.json()) as any;
    expect(out.success).toBe(true);
    const ids = (out.data || []).map((p: any) => p.id);
    expect(ids).toContain(PLUGIN);
    const pomodoro = out.data.find((p: any) => p.id === PLUGIN);
    expect(pomodoro.downloads).toBeGreaterThanOrEqual(0);
  });

  it("install adds to workspace, uninstall removes cleanly, reinstall works", async () => {
    // Install (real backend flow).
    const installed = await installFromRegistry(PLUGIN, WS);
    expect(installed.success).toBe(true);
    let mounted = WorkspaceService.listWorkspacePlugins(WS).map((p) => p.pluginId);
    expect(mounted).toContain(PLUGIN);

    // Reinstall is idempotent, no duplication or data loss.
    const reinstalled = await installFromRegistry(PLUGIN, WS);
    expect(reinstalled.success).toBe(true);
    mounted = WorkspaceService.listWorkspacePlugins(WS).map((p) => p.pluginId);
    expect(mounted.filter((id) => id === PLUGIN).length).toBe(1);

    // Uninstall removes the mount but keeps the registry entry.
    WorkspaceService.removePluginFromWorkspace(WS, PLUGIN);
    mounted = WorkspaceService.listWorkspacePlugins(WS).map((p) => p.pluginId);
    expect(mounted).not.toContain(PLUGIN);

    const { getRegistryPlugin } = await import("../server/plugins/communityRegistry");
    expect(getRegistryPlugin(PLUGIN)).not.toBeNull();

    // And it installs again after removal.
    const again = await installFromRegistry(PLUGIN, WS);
    expect(again.success).toBe(true);
    expect(WorkspaceService.listWorkspacePlugins(WS).map((p) => p.pluginId)).toContain(PLUGIN);
  });

  it("builtin tools pin/unpin through the persisted dock API", async () => {
    const pin = await app.request("/api/dock/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "tabs.pin", id: "browser", workspaceId: WS }),
    });
    expect(pin.status).toBe(200);
    const { listDockPins } = await import("../server/workspace/workspaces");
    expect(listDockPins(WS)).toContain("browser");

    const unpin = await app.request("/api/dock/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "tabs.unpin", id: "browser", workspaceId: WS }),
    });
    expect(unpin.status).toBe(200);
    expect(listDockPins(WS)).not.toContain("browser");
  });

  it("web search failure throws instead of fabricating sources", async () => {
    const realFetch = globalThis.fetch;
    (globalThis as any).fetch = async () => new Response("down", { status: 500 });
    try {
      const { tinyfish } = await import("../server/discovery/tinyfish");
      let thrown: unknown = null;
      try {
        await tinyfish.search(`unreachable ${Date.now()}`, "web", 2);
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(TinyFishError);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
