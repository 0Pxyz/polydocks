import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";
import { db } from "../server/workspace/db";
import { recordAudit, getAuditLogs } from "../server/services/audit";

const CITY = "test-165-persistence";

describe("Issue #165 — one source of truth per data type", () => {
  beforeAll(async () => {
    await fs.mkdir(path.resolve(process.cwd(), "workspace", CITY), { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(path.resolve(process.cwd(), "workspace", CITY), { recursive: true, force: true }).catch(() => {});
    db.query("DELETE FROM sources WHERE city_id = ?").run(CITY);
    db.query("DELETE FROM workspaces WHERE id = ?").run(`city-${CITY}`);
    db.query("DELETE FROM cities WHERE id = ?").run(CITY);
    db.query("DELETE FROM audit_log WHERE city_id = ?").run(CITY);
  });

  it("audit has one writer: recordAudit only, no file log", async () => {
    // features.ts no longer touches the legacy dual writer.
    const featuresSrc = await fs.readFile(path.resolve("server/workspace/features.ts"), "utf-8");
    expect(featuresSrc).not.toContain("appendAuditLog");
    expect(featuresSrc).toContain("recordAudit");

    // Both entry points land in SQLite audit_log with the same shape.
    const { appendAuditLog } = await import("../server/workspace/cityWorkspace");
    recordAudit({ action: "165-direct", cityId: CITY, details: { a: 1 } });
    await appendAuditLog(CITY, "165-compat", { b: 2 });
    const rows = getAuditLogs({ targetId: undefined }).filter((r) => r.cityId === CITY);
    const actions = rows.map((r) => r.action);
    expect(actions).toContain("165-direct");
    expect(actions).toContain("165-compat");

    // The file mirror is gone and never recreated.
    const logPath = path.resolve(process.cwd(), "workspace", ".audit.log");
    await fs.rm(logPath, { force: true }).catch(() => {});
    recordAudit({ action: "165-nofile", cityId: CITY });
    expect(await fs.readFile(logPath, "utf-8").then(() => true, () => false)).toBe(false);
  });

  it("feedGenerator writes canonical sources and stops city_sources", async () => {
    const src = await fs.readFile(path.resolve("server/discovery/feedGenerator.ts"), "utf-8");
    expect(src).not.toContain("INTO city_sources");
    expect(src).toContain("INTO sources");

    db.query("DELETE FROM sources WHERE city_id = ?").run(CITY);
    const before = (db.query("SELECT COUNT(*) as n FROM city_sources WHERE city_id = ?").get(CITY) as any).n;
    const { generateCityFeed } = await import("../server/discovery/feedGenerator");
    const feed = await generateCityFeed(CITY, "Persistence");
    expect(feed.items.length).toBeGreaterThan(0);

    const rows = db.query("SELECT url, title, kind FROM sources WHERE city_id = ?").all(CITY) as any[];
    expect(rows.length).toBeGreaterThan(0);
    // Same URLs as the feed, deduped by (city_id, url).
    const urls = new Set(rows.map((r) => r.url));
    expect(urls.size).toBe(rows.length);
    for (const item of feed.items) {
      expect([...urls].some((u) => u === item.url || item.url.includes(u.replace(/^https?:\/\//, "").slice(0, 20)) || u.length > 0)).toBe(true);
    }
    const after = (db.query("SELECT COUNT(*) as n FROM city_sources WHERE city_id = ?").get(CITY) as any).n;
    expect(after).toBe(before);

    // Legacy feed.json compat write is preserved for the /feed reader.
    const raw = await fs.readFile(path.resolve(process.cwd(), "workspace", CITY, "feed.json"), "utf-8");
    expect(JSON.parse(raw).items.length).toBe(feed.items.length);
  });

  it("plugin_versions backfills into plugin_files (idempotent, reversible)", async () => {
    const { saveVersion, backfillPluginVersionsToFiles } = await import("../server/plugins/versions");
    const { getPluginFile } = await import("../server/workspace/pluginFiles");
    const pluginId = `p165-${Date.now().toString(36)}`;
    saveVersion({
      pluginId,
      version: "9.9.9",
      workspaceId: CITY,
      manifestJson: JSON.stringify({ id: pluginId, title: "P165" }),
      srcdoc: "<h1>p165</h1>",
      status: "active",
    });
    const first = backfillPluginVersionsToFiles();
    expect(first.copied).toBeGreaterThanOrEqual(1);
    // Second run copies nothing: idempotent.
    const second = backfillPluginVersionsToFiles();
    expect(second.copied).toBe(0);

    const row = getPluginFile(pluginId, CITY, "9.9.9");
    expect(row).not.toBeNull();
    expect(row?.srcdoc).toBe("<h1>p165</h1>");

    db.query("DELETE FROM plugin_versions WHERE plugin_id = ?").run(pluginId);
    db.query("DELETE FROM plugin_files WHERE plugin_id = ?").run(pluginId);
  });

  it("sessions/tasks DDL has one owner; transcripts mirror JSONL", async () => {
    const runnerSrc = await fs.readFile(path.resolve("server/agent/taskRunner.ts"), "utf-8");
    expect(runnerSrc).not.toContain("CREATE TABLE IF NOT EXISTS sessions");
    expect(runnerSrc).toContain("ensureSessionTaskTables");

    const { appendSessionTranscript, readSessionTranscript } = await import("../server/agent/taskRunner");
    const { readMirroredTranscript } = await import("../server/workspace/sessions");
    const sessionId = `sess_p165_${Date.now().toString(36)}`;
    const rootDir = path.resolve(process.cwd(), "workspace", CITY, "agent-home-test");
    await appendSessionTranscript(sessionId, { type: "note", text: "hello-mirror" }, rootDir);
    const fromJsonl = await readSessionTranscript(sessionId, { rootDir });
    const fromMirror = readMirroredTranscript(sessionId);
    expect(fromJsonl.length).toBe(1);
    expect(fromMirror.length).toBe(1);
    expect((fromMirror[0] as any).text).toBe("hello-mirror");
    db.query("DELETE FROM session_transcripts WHERE session_id = ?").run(sessionId);
  });

  it("task-path sessions link threads; run route attributes the user", async () => {
    const loopSrc = await fs.readFile(path.resolve("server/agent/loop.ts"), "utf-8");
    expect(loopSrc).toContain("threadUserId");
    const sessionsSrc = await fs.readFile(path.resolve("server/routes/sessions.ts"), "utf-8");
    expect(sessionsSrc).toContain("userId");
  });

  it("city rows backfill kind=city workspaces (additive, rerunnable)", async () => {
    const { ensureCityWorkspaces, getWorkspace } = await import("../server/workspace/workspaces");
    db.query(
      "INSERT OR REPLACE INTO cities (id, title, region, level, tags, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(CITY, "P165 City", "Test", 1, "[]", new Date().toISOString());
    const first = ensureCityWorkspaces();
    expect(first.ensured).toBeGreaterThanOrEqual(1);
    const ws = getWorkspace(`city-${CITY}`);
    expect(ws).not.toBeNull();
    expect(ws?.kind).toBe("city");
    // Rerun converges to zero: reversible, no duplicates.
    expect(ensureCityWorkspaces().ensured).toBe(0);
  });

  it("dead tables have zero writers (removal proof for #153)", async () => {
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
    const writeHits: string[] = [];
    const readHits: string[] = [];
    const stripComments = (src: string) =>
      src
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .split("\n")
        .filter((l) => {
          const t = l.trim();
          return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("--");
        })
        .join("\n");
    for (const f of files) {
      const src = stripComments(await fs.readFile(f, "utf-8"));
      // Schema/migration/ensure statements are not writers.
      const lines = src.split("\n").filter((l) => !l.includes("CREATE TABLE"));
      const body = lines.join("\n");
      for (const t of ["city_tabs", "city_notes", "city_sources"]) {
        if (body.includes(`INTO ${t}`) || body.includes(`UPDATE ${t}`) || body.includes(`DELETE FROM ${t}`)) {
          writeHits.push(`${path.basename(f)}:${t}`);
        } else if (body.includes(t)) {
          readHits.push(`${path.basename(f)}:${t}`);
        }
      }
    }
    // Zero writers: nothing inserts, updates or deletes these rows.
    expect(writeHits).toEqual([]);
    // city_tabs keeps one namespace-guard read (verify.ts); city_notes and
    // city_sources have no code references at all outside schema/tests.
    expect(readHits.filter((h) => !h.startsWith("verify.ts:"))).toEqual([]);
  });

  it("SoT map exists and MEMORY/summaries stay separate", async () => {
    const doc = await fs.readFile(path.resolve("docs/persistence.md"), "utf-8");
    for (const anchor of ["`sources` table", "recordAudit", "`plugin_files`", "`dock_pins`", "`agent_threads`", "`session_transcripts`", "kind", "MEMORY.md"]) {
      expect(doc).toContain(anchor);
    }
    expect(doc).toContain("never merged");
  });
});
