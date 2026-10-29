import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { db } from "../workspace/db";
import { PluginRegistry } from "./registry";
import {
  verifyPluginState,
  isPluginIdTaken,
  normalizePluginId,
  verifyPluginStateAsync,
} from "./verify";
import { ensurePluginFilesTable, upsertPluginFile } from "../workspace/pluginFiles";

const WS = "test-verify-ws";
const ID = "test-verify-plugin";

describe("verifyPluginState + guards", () => {
  beforeAll(() => {
    ensurePluginFilesTable();
    db.query("DELETE FROM plugins WHERE id = ?").run(ID);
    db.query("DELETE FROM plugin_files WHERE workspace_id = ?").run(WS);
    db.query("DELETE FROM workspace_plugins WHERE plugin_id = ?").run(ID);
  });

  afterAll(() => {
    db.query("DELETE FROM plugins WHERE id = ?").run(ID);
    db.query("DELETE FROM plugin_files WHERE workspace_id = ?").run(WS);
    db.query("DELETE FROM workspace_plugins WHERE plugin_id = ?").run(ID);
  });

  it("normalizes ids before duplicate checks", () => {
    expect(normalizePluginId("  My-Plugin ")).toBe("my-plugin");
  });

  it("fails registry check when no registry row exists", () => {
    const res = verifyPluginState(ID, WS);
    expect(res.ok).toBe(false);
    expect(res.checks.find((c) => c.name === "registry")?.ok).toBe(false);
    expect(res.error).toContain("registry");
  });

  it("fails mount check when registry exists but workspace mount missing", () => {
    PluginRegistry.getInstance().install({
      apiVersion: 1,
      id: ID,
      name: "Verify",
      version: "1.0.0",
      description: "verify test",
      icon: "Cards",
      trust: "generated",
      capabilities: [],
      surfaces: [],
      permissions: [],
    });
    upsertPluginFile({
      workspaceId: WS,
      pluginId: ID,
      version: "1.0.0",
      manifest: { id: ID, title: "Verify" },
      srcdoc: "<html>ok</html>",
    });
    const res = verifyPluginState(ID, WS);
    expect(res.checks.find((c) => c.name === "registry")?.ok).toBe(true);
    expect(res.checks.find((c) => c.name === "mount")?.ok).toBe(false);
    expect(res.ok).toBe(false);
    expect(res.error).toContain("mount");
  });

  it("fails manifest check when registry manifest is corrupt", async () => {
    db.query("DELETE FROM workspace_plugins WHERE plugin_id = ?").run(ID);
    db.query(
      `INSERT OR REPLACE INTO workspace_plugins (workspace_id, plugin_id, enabled, position, installed_at)
       VALUES (?, ?, 1, 0, ?)`
    ).run(WS, ID, new Date().toISOString());
    // Corrupt the registry manifest directly (bypasses schema validation).
    db.query("UPDATE plugins SET manifest_json = ? WHERE id = ?").run("not-json{{{", ID);
    const res = await verifyPluginStateAsync(ID, WS);
    // DB manifest corrupt AND plugin_files manifest valid -> manifest still ok via fallback.
    // Force both corrupt: overwrite plugin_files manifest too.
    upsertPluginFile({
      workspaceId: WS,
      pluginId: ID,
      version: "corrupt",
      manifest: { id: ID, title: "x" } as any,
      srcdoc: "<html>ok</html>",
    });
    db.query(
      "UPDATE plugin_files SET manifest_json = ? WHERE workspace_id = ? AND plugin_id = ? AND version = ?"
    ).run("not-json{{{", WS, ID, "corrupt");
    db.query("DELETE FROM plugin_files WHERE workspace_id = ? AND plugin_id = ? AND version = ?").run(
      WS,
      ID,
      "1.0.0"
    );
    const res2 = verifyPluginState(ID, WS);
    expect(res2.checks.find((c) => c.name === "manifest")?.ok).toBe(false);
    expect(res2.ok).toBe(false);
    void res;
  });

  it("fails srcdoc check when srcdoc is empty", () => {
    db.query("UPDATE plugins SET manifest_json = ? WHERE id = ?").run(
      JSON.stringify({
        apiVersion: 1,
        id: ID,
        name: "Verify",
        version: "1.0.0",
        description: "verify test",
        icon: "Cards",
        trust: "generated",
        capabilities: [],
        surfaces: [],
        permissions: [],
      }),
      ID
    );
    db.query("DELETE FROM plugin_files WHERE workspace_id = ? AND plugin_id = ?").run(WS, ID);
    upsertPluginFile({
      workspaceId: WS,
      pluginId: ID,
      version: "1.0.0",
      manifest: { id: ID, title: "Verify" },
      srcdoc: "   ",
    });
    const res = verifyPluginState(ID, WS);
    expect(res.checks.find((c) => c.name === "srcdoc")?.ok).toBe(false);
    expect(res.ok).toBe(false);
  });

  it("checks registry and tab namespaces across all scopes", () => {
    expect(isPluginIdTaken(ID).taken).toBe(true);
    expect(isPluginIdTaken(ID.toUpperCase()).taken).toBe(true);
    expect(isPluginIdTaken("definitely-not-a-real-plugin-xyz").taken).toBe(false);
  });
});
