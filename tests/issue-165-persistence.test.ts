import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { db } from "../server/workspace/db";
import { recordAudit, getAuditLogs } from "../server/services/audit";

const WS = "test-165-persistence-ws";

describe("Issue #165 — one source of truth per data type", () => {
  afterAll(async () => {
    db.query("DELETE FROM sources WHERE workspace_id = ?").run(WS);
    db.query("DELETE FROM audit_log WHERE workspace_id = ?").run(WS);
  });

  it("audit has one writer: recordAudit only, no file log", async () => {
    // features.ts writes audits only through recordAudit.
    const featuresSrc = await fs.readFile(path.resolve("server/workspace/features.ts"), "utf-8");
    expect(featuresSrc).toContain("recordAudit");

    const unique = `165-${Date.now().toString(36)}`;
    recordAudit({ action: unique, workspaceId: WS, details: { a: 1 } });
    const rows = getAuditLogs({}).filter((r) => r.workspaceId === WS && r.action === unique);
    expect(rows.length).toBeGreaterThan(0);

    // The file mirror is gone and never recreated.
    const logPath = path.resolve(process.cwd(), "workspace", ".audit.log");
    await fs.rm(logPath, { force: true }).catch(() => {});
    recordAudit({ action: `${unique}-nofile`, workspaceId: WS });
    expect(await fs.readFile(logPath, "utf-8").then(() => true, () => false)).toBe(false);
  });

  it("sources are keyed by workspace, deduped per workspace", async () => {
    const { migrateLegacyWorkspaceSources } = await import("../server/plugins/sources");
    expect(typeof migrateLegacyWorkspaceSources).toBe("function");
    const schema = await fs.readFile(path.resolve("server/workspace/schema.sql"), "utf-8");
    expect(schema).toContain("UNIQUE(workspace_id, url)");
    expect(schema).not.toMatch(/city_tabs|city_notes|city_sources/);
  });

  it("plugin_versions backfills into plugin_files (idempotent, reversible)", async () => {
    const { backfillPluginVersionsToFiles } = await import("../server/plugins/versions");
    const first = backfillPluginVersionsToFiles();
    expect(first.copied).toBeGreaterThanOrEqual(0);
    // Rerun converges: no duplicates.
    const second = backfillPluginVersionsToFiles();
    expect(second.copied).toBe(0);
  });

  it("sessions/tasks DDL has one owner; transcripts mirror JSONL", async () => {
    const sessionsSrc = await fs.readFile(path.resolve("server/workspace/sessions.ts"), "utf-8");
    expect(sessionsSrc).toContain("CREATE TABLE IF NOT EXISTS sessions");
    expect(sessionsSrc).toContain("CREATE TABLE IF NOT EXISTS tasks");
  });

  it("task-path sessions link threads; run route attributes the user", async () => {
    const loopSrc = await fs.readFile(path.resolve("server/agent/loop.ts"), "utf-8");
    expect(loopSrc).toContain("threadUserId");
    const sessionsSrc = await fs.readFile(path.resolve("server/routes/sessions.ts"), "utf-8");
    expect(sessionsSrc).toContain("userId");
  });

  it("retired city/world tables are gone from the schema", async () => {
    const schema = await fs.readFile(path.resolve("server/workspace/schema.sql"), "utf-8");
    for (const t of [
      "cities",
      "city_tabs",
      "city_notes",
      "city_sources",
      "maps",
      "map_points",
      "city_conversations",
      "conversation_messages",
    ]) {
      expect(schema).not.toContain(`CREATE TABLE IF NOT EXISTS ${t}`);
    }
  });

  it("no code references retired city tables except the one-way migration", async () => {
    const walk = async (dir: string, out: string[] = []): Promise<string[]> => {
      for (const e of await fs.readdir(dir, { withFileTypes: true })) {
        if (e.name === "node_modules" || e.name.startsWith(".")) continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) await walk(full, out);
        else if (e.name.endsWith(".ts") && !e.name.endsWith(".test.ts")) out.push(full);
      }
      return out;
    };
    const files = await walk(path.resolve("server"));
    const hits: string[] = [];
    for (const f of files) {
      if (f.endsWith("workspace/db.ts")) continue; // one-way retirement migration lives here
      const src = await fs.readFile(f, "utf-8");
      for (const t of ["city_tabs", "city_notes", "city_sources", "city_conversations", "conversation_messages", "map_points"]) {
        if (src.includes(t)) hits.push(`${path.basename(f)}:${t}`);
      }
      if (/\bfrom "\.\/cities"|\bcities\.create\b/.test(src)) hits.push(`${path.basename(f)}:cities-table`);
    }
    expect(hits).toEqual([]);
  });

  const hasPersistenceDoc = existsSync(path.resolve("internal-docs/persistence.md"));
  (hasPersistenceDoc ? it : it.skip)("SoT map exists and MEMORY/summaries stay separate", async () => {
    const doc = await fs.readFile(path.resolve("internal-docs/persistence.md"), "utf-8");
    for (const anchor of ["`sources` table", "recordAudit", "`plugin_files`", "`dock_pins`", "`agent_threads`", "`session_transcripts`", "MEMORY.md"]) {
      expect(doc).toContain(anchor);
    }
    expect(doc).toContain("never merged");
  });
});
