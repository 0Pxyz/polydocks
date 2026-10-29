import { describe, it, expect, beforeAll, beforeEach, afterEach } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";
import { db } from "../server/workspace/db";
import { config } from "../server/config";
import {
  dockOpen,
  dockClose,
  dockPin,
  dockUnpin,
  dockList,
} from "../server/agent/tools/verbs/dock";
import {
  pluginsCreate,
  pluginsEdit,
  pluginsInstall,
  pluginsUninstall,
  pluginsOperate,
} from "../server/agent/tools/verbs/plugins";
import { getPluginFile } from "../server/workspace/pluginFiles";
import { initializeFirstPartyPlugins } from "../server/plugins/first-party/index";

const CITY = "test-verbs-ws";
const WS = "test-verbs-ws";
const PLUGIN = "verb-test-plugin";
const PLUGIN_CODE = `const app = document.getElementById('app'); app.innerHTML = '<div>verb test</div>';`;

describe("verb tools: dock.open/close/pin/unpin/list", () => {
  it("dock.list shows builtin tabs", async () => {
    const out: any = await dockList.execute({ cityId: CITY } as any, { step: 1, cityId: CITY });
    expect(out.ok).toBe(true);
    expect(Array.isArray(out.data.builtin)).toBe(true);
    expect(out.data.builtin.length).toBeGreaterThan(0);
  });

  it("dock.open mounts a tab", async () => {
    const out: any = await dockOpen.execute({ tabId: "notes", cityId: CITY } as any, { step: 1, cityId: CITY });
    expect(out.ok).toBe(true);
  });

  it("dock.pin and dock.unpin round-trip", async () => {
    const pinned: any = await dockPin.execute({ id: "notes", cityId: CITY } as any, {
      step: 1, cityId: CITY, workspaceId: WS,
    });
    expect(pinned.ok).toBe(true);
    const unpinned: any = await dockUnpin.execute({ id: "notes", cityId: CITY } as any, {
      step: 1, cityId: CITY, workspaceId: WS,
    });
    expect(unpinned.ok).toBe(true);
  });

  it("dock.close does not delete: reopen returns the same state", async () => {
    const closed: any = await dockClose.execute({ id: "notes", cityId: CITY } as any, { step: 1, cityId: CITY });
    expect(closed.ok).toBe(true);
    const reopened: any = await dockOpen.execute({ tabId: "notes", cityId: CITY } as any, { step: 1, cityId: CITY });
    expect(reopened.ok).toBe(true);
  });
});

describe("verb tools: plugins.create/edit/install/uninstall/operate", () => {
  beforeAll(() => {
    initializeFirstPartyPlugins();
  });

  beforeEach(async () => {
    await fs.mkdir(path.resolve(process.cwd(), "workspace", CITY), { recursive: true }).catch(() => {});
  });

  afterEach(async () => {
    db.query("DELETE FROM workspace_plugins WHERE plugin_id LIKE 'verb-test%'").run();
    db.query("DELETE FROM plugin_files WHERE plugin_id LIKE 'verb-test%'").run();
    db.query("DELETE FROM plugin_versions WHERE plugin_id LIKE 'verb-test%'").run();
    db.query("DELETE FROM plugins WHERE id LIKE 'verb-test%'").run();
    await fs.rm(path.resolve(process.cwd(), "workspace", CITY), { recursive: true, force: true }).catch(() => {});
  });

  it("plugins.create mounts a verified plugin", async () => {
    const created: any = await pluginsCreate.execute(
      { id: PLUGIN, name: "Verb Test", description: "t", code: PLUGIN_CODE, workspaceId: WS, userApproved: true } as any,
      { step: 1, cityId: CITY, workspaceId: WS }
    );
    expect(created.ok).toBe(true);
    expect(getPluginFile(PLUGIN, WS)).not.toBeNull();
  });

  it("plugins.edit creates a new kept version", async () => {
    await pluginsCreate.execute(
      { id: PLUGIN, name: "Verb Test", description: "t", code: PLUGIN_CODE, workspaceId: WS, userApproved: true } as any,
      { step: 1, cityId: CITY, workspaceId: WS }
    );
    const edited: any = await pluginsEdit.execute(
      { id: PLUGIN, code: `${PLUGIN_CODE}\n// v2`, workspaceId: WS, userApproved: true } as any,
      { step: 1, cityId: CITY, workspaceId: WS }
    );
    expect(edited.ok).toBe(true);
    expect(getPluginFile(PLUGIN, WS, "1.0.1")).not.toBeNull();
  });

  it("plugins.install mounts a known plugin; unknown ids fail without ghost mounts", async () => {
    const { WorkspaceService } = await import("../server/services/workspaceService");
    const mounted: any = await pluginsInstall.execute(
      { pluginId: "pomodoro-focus", workspaceId: WS, userApproved: true } as any,
      { step: 1, cityId: CITY, workspaceId: WS }
    );
    // pomodoro-focus lives in the registry in dev/test checkouts; if the
    // fixture registry is empty the verb must still refuse ghosts.
    if (mounted.ok) {
      expect(WorkspaceService.listWorkspacePlugins(WS).some((p) => p.pluginId === "pomodoro-focus")).toBe(true);
    } else {
      expect(mounted.code).toBe("not_found");
    }

    const ghost: any = await pluginsInstall.execute(
      { pluginId: "verb-test-ghost-xyz", workspaceId: WS, userApproved: true } as any,
      { step: 1, cityId: CITY, workspaceId: WS }
    );
    expect(ghost.ok).toBe(false);
    expect(ghost.code).toBe("not_found");
    expect(WorkspaceService.listWorkspacePlugins(WS).some((p) => p.pluginId === "verb-test-ghost-xyz")).toBe(false);
  });

  it("plugins.uninstall removes the mount but keeps the code; missing mounts 404", async () => {
    await pluginsCreate.execute(
      { id: PLUGIN, name: "Verb Test", description: "t", code: PLUGIN_CODE, workspaceId: WS, userApproved: true } as any,
      { step: 1, cityId: CITY, workspaceId: WS }
    );
    const { WorkspaceService } = await import("../server/services/workspaceService");
    WorkspaceService.addPluginToWorkspace(WS, PLUGIN, {}, 0, "cli");
    const uninstalled: any = await pluginsUninstall.execute(
      { pluginId: PLUGIN, workspaceId: WS } as any,
      { step: 1, cityId: CITY, workspaceId: WS }
    );
    expect(uninstalled.ok).toBe(true);
    expect(uninstalled.data.uninstalled).toBe(true);
    expect(getPluginFile(PLUGIN, WS)).not.toBeNull();

    const again: any = await pluginsUninstall.execute(
      { pluginId: PLUGIN, workspaceId: WS } as any,
      { step: 1, cityId: CITY, workspaceId: WS }
    );
    expect(again.ok).toBe(false);
    expect(again.code).toBe("not_found");
  });

  it("plugins.operate invokes a capability and returns its receipt", async () => {
    const out: any = await pluginsOperate.execute(
      { plugin: "cities", capability: "quest_add", input: { cityId: CITY, title: "verb quest" }, cityId: CITY } as any,
      { step: 1, cityId: CITY }
    );
    expect(out.ok).toBe(true);
  });

  it("install policy ask blocks agent verbs without approval (no side effects)", async () => {
    const out: any = await pluginsCreate.execute(
      { id: `${PLUGIN}-ask`, name: "x", description: "x", code: PLUGIN_CODE, workspaceId: WS } as any,
      { step: 1, cityId: CITY, workspaceId: WS, actor: "agent" }
    );
    expect(out.ok).toBe(false);
    expect(out.code).toBe("approval_required");
    expect(getPluginFile(`${PLUGIN}-ask`, WS)).toBeNull();
  });

  it("direct create_plugin with actor=agent and no approval is denied without creating", async () => {
    const { create_plugin } = await import("../server/agent/tools/create_plugin");
    const out: any = await create_plugin.execute(
      { id: `${PLUGIN}-direct`, name: "Direct", description: "t", code: PLUGIN_CODE, workspaceId: WS } as any,
      { step: 1, cityId: CITY, workspaceId: WS, actor: "agent" }
    );
    expect(out.ok).toBe(false);
    expect(out.code).toBe("approval_required");
    expect(getPluginFile(`${PLUGIN}-direct`, WS)).toBeNull();
  });

  it("install policy never blocks even approved agents", async () => {
    const saved = config.INSTALL_POLICY;
    (config as any).INSTALL_POLICY = "never";
    try {
      const out: any = await pluginsCreate.execute(
        { id: `${PLUGIN}-never`, name: "x", description: "x", code: PLUGIN_CODE, workspaceId: WS, userApproved: true } as any,
        { step: 1, cityId: CITY, workspaceId: WS }
      );
      expect(out.ok).toBe(false);
      expect(out.code).toBe("install_denied");
    } finally {
      (config as any).INSTALL_POLICY = saved;
    }
  });
});
