import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { db } from "../../workspace/db";
import { modify_plugin } from "./modify_plugin";
import { inspect_experience } from "./inspect_experience";
import { create_plugin } from "./create_plugin";
import { deleteFeature } from "../../workspace/features";

const WS = `test-inspect-patch-ws-${Date.now().toString(36)}`;
const ID = `test-patch-plugin-${Date.now().toString(36)}`;

const CODE_V1 = `const app = document.getElementById('app'); if (app) app.textContent = 'hello v1';`;

describe("inspect -> patch -> verify (no recreate)", () => {
  beforeAll(async () => {
    db.query("DELETE FROM plugins WHERE id = ?").run(ID);
    db.query("DELETE FROM plugin_files WHERE workspace_id = ?").run(WS);
    db.query("DELETE FROM workspace_plugins WHERE plugin_id = ?").run(ID);
    await create_plugin.execute(
      { id: ID, name: "Patch Me", description: "patch test", code: CODE_V1, workspaceId: WS },
      { workspaceId: WS, step: 1 }
    );
  });

  afterAll(async () => {
    await deleteFeature(WS, ID).catch(() => {});
    db.query("DELETE FROM plugins WHERE id = ?").run(ID);
    db.query("DELETE FROM workspace_plugins WHERE plugin_id = ?").run(ID);
    db.query("DELETE FROM plugin_versions WHERE plugin_id = ?").run(ID);
    db.query("DELETE FROM plugin_files WHERE plugin_id = ?").run(ID);
  });

  it("inspect returns source, version, history, mounts, verification", async () => {
    const res = (await inspect_experience.execute(
      { id: ID, workspaceId: WS },
      { workspaceId: WS, step: 1 }
    )) as any;
    expect(res.success).toBe(true);
    expect(res.files.source).toContain("hello v1");
    expect(res.experience.currentVersion).toBeString();
    expect(Array.isArray(res.experience.versionHistory)).toBe(true);
    expect(res.experience.versionHistory.length).toBeGreaterThanOrEqual(1);
    expect(res.experience.mountedWorkspaces.some((m: any) => m.workspaceId === WS)).toBe(true);
    expect(res.experience.verification.ok).toBe(true);
    expect(res.fixHint).toContain("modify_plugin");
  });

  it("surgical patch edits source without changing the id", async () => {
    const res = (await modify_plugin.execute(
      {
        id: ID,
        patch: { find: "hello v1", replace: "hello v2" },
        changeSummary: "bump greeting",
        workspaceId: WS,
      },
      { workspaceId: WS, step: 2 }
    )) as any;
    expect(res.success).toBe(true);
    expect(res.pluginId).toBe(ID);

    const reinspected = (await inspect_experience.execute(
      { id: ID, workspaceId: WS },
      { workspaceId: WS, step: 3 }
    )) as any;
    expect(reinspected.files.source).toContain("hello v2");
    expect(reinspected.files.source).not.toContain("hello v1");
  });

  it("patch with no match fails instead of corrupting", async () => {
    const res = (await modify_plugin.execute(
      {
        id: ID,
        patch: { find: "no-such-string-xyz", replace: "x" },
        changeSummary: "bad patch",
        workspaceId: WS,
      },
      { workspaceId: WS, step: 4 }
    )) as any;
    expect(res.success).toBe(false);
    expect(res.error).toContain("Patch target not found");
  });

  it("metadata-only update works without code", async () => {
    const res = (await modify_plugin.execute(
      { id: ID, changeSummary: "rename", name: "Patched Title", workspaceId: WS },
      { workspaceId: WS, step: 5 }
    )) as any;
    expect(res.success).toBe(true);
    const reinspected = (await inspect_experience.execute(
      { id: ID, workspaceId: WS },
      { workspaceId: WS, step: 6 }
    )) as any;
    expect(reinspected.files.source).toContain("hello v2");
  });
});
