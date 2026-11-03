import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { findEquivalentPlugins, normalizePluginName } from "../server/plugins/verify";
import { db } from "../server/workspace/db";

/**
 * Duplicate-synthesis guard (#346): the agent only sees pinned dock items,
 * so the server must refuse same-name equivalents under a different slug.
 * Pure registry check, runs before any write.
 */
describe("duplicate plugin guard (#346)", () => {
  const IDS = ["t346-feed-a", "t346-feed-b"];

  function clean() {
    for (const table of ["plugins", "workspace_plugins", "plugin_files"]) {
      const col = table === "plugins" ? "id" : "plugin_id";
      try {
        db.query(`DELETE FROM ${table} WHERE ${col} IN ('t346-feed-a', 't346-feed-b', 't346-test-feed-2')`).run();
      } catch {}
    }
  }

  beforeEach(() => {
    clean();
    const now = new Date().toISOString();
    db.query(
      "INSERT INTO plugins (id, name, version, manifest_json, enabled, trust, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run("t346-feed-a", "T346 Test Feed", "1.0.0", "{}", 1, "generated", now, now);
  });

  afterEach(() => {
    clean();
  });

  it("normalizes names case- and punctuation-insensitively", () => {
    expect(normalizePluginName("AI Agents Feed")).toBe("aiagentsfeed");
    expect(normalizePluginName("ai-agents-feed")).toBe("aiagentsfeed");
    expect(normalizePluginName("  AI_Agents Feed! ")).toBe("aiagentsfeed");
  });

  it("finds equivalents by name and by id stem, excluding self", () => {
    const byName = findEquivalentPlugins("T346 Test Feed", "something-else");
    expect(byName.map((m) => m.id)).toContain("t346-feed-a");

    const bySlug = findEquivalentPlugins("t346-test-feed-2", "t346-test-feed-2");
    expect(bySlug.map((m) => m.id)).toContain("t346-feed-a");

    const selfExcluded = findEquivalentPlugins("T346 Test Feed", "t346-feed-a");
    expect(selfExcluded.map((m) => m.id)).not.toContain("t346-feed-a");
  });

  it("finds workspace installs even without a registry row", () => {
    db.query(
      "INSERT OR IGNORE INTO workspace_plugins (workspace_id, plugin_id, enabled, installed_at) VALUES (?, ?, 1, ?)"
    ).run("ws-t346", "t346-feed-b", new Date().toISOString());
    const found = findEquivalentPlugins("t346 feed b");
    expect(found.map((m) => m.id)).toContain("t346-feed-b");
    expect(found.find((m) => m.id === "t346-feed-b")?.where).toBe("workspace");
    try {
      db.query("DELETE FROM workspace_plugins WHERE plugin_id = 't346-feed-b'").run();
    } catch {}
  });

  it("refuses equivalent creation before any write", async () => {
    const { create_plugin } = await import("../server/agent/tools/create_plugin");
    const res: any = await create_plugin.execute(
      {
        id: "t346-test-feed-2",
        name: "T346 Test Feed",
        description: "duplicate attempt",
        code: "export default function P() { return null; } // 1234567890",
      } as any,
      { actor: "user", workspaceId: "ws-t346" } as any
    );
    expect(res?.success).toBe(false);
    expect(String(res?.error || "")).toContain("t346-feed-a");
    expect(String(res?.error || "")).toContain("modify_plugin");
    // Nothing was written for the refused slug.
    const row = db.query("SELECT COUNT(*) as count FROM plugins WHERE id = ?").get("t346-test-feed-2") as any;
    expect(row?.count ?? 0).toBe(0);
    void IDS;
  });
});
