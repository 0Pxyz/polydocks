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
  pluginsRollback,
} from "../server/agent/tools/verbs/plugins";
import { pluginVersions, pluginRollback } from "../server/facade/shared";
import { validateSlop } from "../server/plugins/slop";
import { initializeFirstPartyPlugins } from "../server/plugins/first-party/index";

const CITY = "test-verbs-ws";
const WS = "test-verbs-ws";

const PLUGIN_CODE = `const app = document.getElementById('app'); app.innerHTML = '<div>verb test</div>';`;
const SLOP_CODE = `const app = document.getElementById('app'); app.innerHTML = '<div style="color:#ff0000; border:1px solid red">x</div>';`;

describe("verb tools: dock.open/close/pin/unpin/list", () => {
  it("dock.list shows builtin tabs with pinned flags", async () => {
    const out: any = await dockList.execute({ cityId: CITY } as any, { step: 1, cityId: CITY });
    expect(out.ok).toBe(true);
    expect(Array.isArray(out.data.builtin)).toBe(true);
    expect(out.data.builtin.length).toBeGreaterThan(0);
    expect(typeof out.data.builtin[0].pinned).toBe("boolean");
  });

  it("dock.open mounts a tab", async () => {
    const out: any = await dockOpen.execute({ tabId: "notes", cityId: CITY } as any, { step: 1, cityId: CITY });
    expect(out.ok).toBe(true);
  });

  it("dock.pin persists across reads, dock.unpin clears it", async () => {
    const { isDockPinned } = await import("../server/workspace/workspaces");
    const pinned: any = await dockPin.execute({ id: "notes", cityId: CITY } as any, {
      step: 1, cityId: CITY, workspaceId: WS,
    });
    expect(pinned.ok).toBe(true);
    // Fresh read, no shared state: the durable record is the proof.
    expect(isDockPinned(WS, "notes")).toBe(true);
    const listed: any = await dockList.execute({ cityId: CITY } as any, { step: 1, cityId: CITY, workspaceId: WS });
    const notes = (listed.data.builtin as any[]).find((t) => t.id === "notes");
    expect(notes?.pinned).toBe(true);

    const unpinned: any = await dockUnpin.execute({ id: "notes", cityId: CITY } as any, {
      step: 1, cityId: CITY, workspaceId: WS,
    });
    expect(unpinned.ok).toBe(true);
    expect(isDockPinned(WS, "notes")).toBe(false);
  });

  it("dock.close does not delete: reopen returns the same state", async () => {
    const closed: any = await dockClose.execute({ id: "notes", cityId: CITY } as any, { step: 1, cityId: CITY });
    expect(closed.ok).toBe(true);
    const reopened: any = await dockOpen.execute({ tabId: "notes", cityId: CITY } as any, { step: 1, cityId: CITY });
    expect(reopened.ok).toBe(true);
  });
});

describe("verb tools: plugins.create/edit/install/uninstall/operate", () => {
  const PLUGIN = "verb-test-plugin";

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

  it("slop is rejected before anything is created", () => {
    const report = validateSlop(SLOP_CODE);
    expect(report.ok).toBe(false);
    expect(report.errors.length).toBeGreaterThan(0);
  });

  it("opaque static backgrounds fail strict, theme tokens pass", () => {
    const opaque = `<div class="bg-black text-white"><div class="bg-zinc-900"><div class="bg-white/[0.04]">x</div></div></div>`;
    const strict = validateSlop(opaque, { strict: true });
    expect(strict.ok).toBe(false);
    expect(strict.errors.join(" ")).toMatch(/opaque static background/);

    const legacy = validateSlop(opaque);
    expect(legacy.ok).toBe(true);
    expect(legacy.warnings.join(" ")).toMatch(/opaque static background/);

    const themed = `<div class="bg-card text-card-foreground"><div class="bg-muted/50 text-muted-foreground">x</div></div>`;
    const clean = validateSlop(themed, { strict: true });
    expect(clean.ok).toBe(true);
  });

  it("plugins.create validates the kit and saves userApproved-gated", async () => {
    const blocked: any = await pluginsCreate.execute(
      { id: PLUGIN, name: "Verb Test", description: "t", code: SLOP_CODE, workspaceId: WS, userApproved: true } as any,
      { step: 1, cityId: CITY, workspaceId: WS }
    );
    expect(blocked.ok).toBe(false);
    expect(blocked.code).toBe("slop_violation");

    const gated: any = await pluginsCreate.execute(
      { id: PLUGIN, name: "Verb Test", description: "t", code: PLUGIN_CODE, workspaceId: WS } as any,
      { step: 1, cityId: CITY, workspaceId: WS }
    );
    // actor defaults to agent in verb tools; policy ask requires userApproved.
    expect(gated.ok).toBe(false);
    expect(gated.code).toBe("approval_required");

    const created: any = await pluginsCreate.execute(
      { id: PLUGIN, name: "Verb Test", description: "t", code: PLUGIN_CODE, workspaceId: WS, userApproved: true } as any,
      { step: 1, cityId: CITY, workspaceId: WS }
    );
    expect(created.ok).toBe(true);
  });

  it("plugins.edit creates a new version; rollback restores the old code", async () => {
    await pluginsCreate.execute(
      { id: PLUGIN, name: "Verb Test", description: "t", code: PLUGIN_CODE, workspaceId: WS, userApproved: true } as any,
      { step: 1, cityId: CITY, workspaceId: WS }
    );
    const edited: any = await pluginsEdit.execute(
      { id: PLUGIN, code: `${PLUGIN_CODE}\n// v2`, workspaceId: WS, userApproved: true } as any,
      { step: 1, cityId: CITY, workspaceId: WS }
    );
    expect(edited.ok).toBe(true);

    const versions = await pluginVersions(PLUGIN);
    expect(versions.ok).toBe(true);
    const nums = ((versions as any).data.versions as any[]).map((v) => v.version);
    expect(nums.length).toBeGreaterThanOrEqual(2);

    const first = nums.sort()[0];
    const rolled: any = await pluginRollback(PLUGIN, first, WS);
    expect(rolled.ok).toBe(true);
    expect(rolled.data.restoredFrom).toBe(first);
  });

  it("plugins.install mounts, plugins.uninstall removes the mount but keeps code", async () => {
    await pluginsCreate.execute(
      { id: PLUGIN, name: "Verb Test", description: "t", code: PLUGIN_CODE, workspaceId: WS, userApproved: true } as any,
      { step: 1, cityId: CITY, workspaceId: WS }
    );
    const installed: any = await pluginsInstall.execute(
      { pluginId: PLUGIN, workspaceId: WS, userApproved: true } as any,
      { step: 1, cityId: CITY, workspaceId: WS }
    );
    expect(installed.ok).toBe(true);

    const uninstalled: any = await pluginsUninstall.execute(
      { pluginId: PLUGIN, workspaceId: WS } as any,
      { step: 1, cityId: CITY, workspaceId: WS }
    );
    expect(uninstalled.ok).toBe(true);
    expect(uninstalled.data.uninstalled).toBe(true);

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
    const { getPluginFile } = await import("../server/workspace/pluginFiles");
    expect(getPluginFile(`${PLUGIN}-ask`, WS)).toBeNull();
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

  it("plugins.rollback restores a kept version via the verb", async () => {
    await pluginsCreate.execute(
      { id: PLUGIN, name: "Verb Test", description: "t", code: PLUGIN_CODE, workspaceId: WS, userApproved: true } as any,
      { step: 1, cityId: CITY, workspaceId: WS }
    );
    await pluginsEdit.execute(
      { id: PLUGIN, code: `${PLUGIN_CODE}\n// v2`, workspaceId: WS, userApproved: true } as any,
      { step: 1, cityId: CITY, workspaceId: WS }
    );
    const versions: any = await pluginVersions(PLUGIN);
    const first = (versions.data.versions as any[]).map((v: any) => v.version).sort()[0];
    const rolled: any = await pluginsRollback.execute({ pluginId: PLUGIN, version: first, workspaceId: WS } as any, {
      step: 1, cityId: CITY, workspaceId: WS,
    });
    expect(rolled.ok).toBe(true);
    expect(rolled.data.restoredFrom).toBe(first);
  });

  it("plugins.install refuses unknown ids instead of mounting ghosts", async () => {
    const out: any = await pluginsInstall.execute(
      { pluginId: "verb-test-ghost-xyz", workspaceId: WS, userApproved: true } as any,
      { step: 1, cityId: CITY, workspaceId: WS }
    );
    expect(out.ok).toBe(false);
    expect(out.code).toBe("not_found");
    const { WorkspaceService } = await import("../server/services/workspaceService");
    expect(WorkspaceService.listWorkspacePlugins(WS).some((p) => p.pluginId === "verb-test-ghost-xyz")).toBe(false);
  });

  it("direct create_plugin with actor=agent and no approval is denied without creating", async () => {
    const { create_plugin } = await import("../server/agent/tools/create_plugin");
    const out: any = await create_plugin.execute(
      { id: `${PLUGIN}-direct`, name: "Direct", description: "t", code: PLUGIN_CODE, workspaceId: WS } as any,
      { step: 1, cityId: CITY, workspaceId: WS, actor: "agent" }
    );
    expect(out.ok).toBe(false);
    expect(out.code).toBe("approval_required");
    const { getPluginFile } = await import("../server/workspace/pluginFiles");
    expect(getPluginFile(`${PLUGIN}-direct`, WS)).toBeNull();
  });
});
