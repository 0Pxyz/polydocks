import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";
import { initAgentHome } from "../server/system/agentHome";
import {
  recordMemory,
  promoteToCuratedMemory,
  getMemoryOverview,
  deleteMemoryEntry,
} from "../server/agent/memory";
import app from "../server/index";

/**
 * Single-entry memory delete (#105 inspector backend slice).
 * Function-level deletes run against an isolated rootDir; the HTTP route
 * is covered for validation paths that never touch the filesystem.
 */
describe("memory single-entry delete (#105)", () => {
  const TEST_ROOT = path.resolve(process.cwd(), "test-memory-delete-fixture");
  const originalEnv = process.env.AGENT_HOME_DIR;

  beforeEach(async () => {
    process.env.AGENT_HOME_DIR = TEST_ROOT;
    await fs.rm(TEST_ROOT, { recursive: true, force: true }).catch(() => {});
    await initAgentHome(TEST_ROOT);
  });

  afterEach(async () => {
    if (originalEnv !== undefined) {
      process.env.AGENT_HOME_DIR = originalEnv;
    } else {
      delete process.env.AGENT_HOME_DIR;
    }
    await fs.rm(TEST_ROOT, { recursive: true, force: true }).catch(() => {});
  });

  it("deletes a curated bullet by content match, first match only", async () => {
    await promoteToCuratedMemory("prefers dark-only UI", "user_preference", TEST_ROOT);
    await promoteToCuratedMemory("unrelated architectural rule", "architectural_rule", TEST_ROOT);

    const result = await deleteMemoryEntry({
      content: "prefers dark-only UI",
      scope: "curated",
      rootDir: TEST_ROOT,
    });
    expect(result.removed).toBe(true);
    expect(result.scope).toBe("curated");

    const overview = await getMemoryOverview(TEST_ROOT);
    expect(overview.memoryMd.includes("prefers dark-only UI")).toBe(false);
    expect(overview.memoryMd.includes("unrelated architectural rule")).toBe(true);
  });

  it("deletes a daily log line by content match", async () => {
    const recorded = await recordMemory({
      content: "ephemeral note to forget",
      category: "general",
      rootDir: TEST_ROOT,
    });
    expect(recorded.recorded).toBe(true);

    const result = await deleteMemoryEntry({
      content: "ephemeral note to forget",
      scope: "daily",
      rootDir: TEST_ROOT,
    });
    expect(result.removed).toBe(true);
    expect(result.scope).toBe("daily");
  });

  it("returns removed:false when nothing matches", async () => {
    const result = await deleteMemoryEntry({
      content: "no such memory entry anywhere",
      scope: "all",
      rootDir: TEST_ROOT,
    });
    expect(result.removed).toBe(false);
    expect(result.scope).toBeNull();
  });

  it("DELETE /api/agent/memory/entry rejects bad input without touching storage", async () => {
    const missing = await app.fetch(
      new Request("http://localhost:3000/api/agent/memory/entry", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
    );
    expect(missing.status).toBe(400);

    const badScope = await app.fetch(
      new Request("http://localhost:3000/api/agent/memory/entry", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "x", scope: "everything" }),
      })
    );
    expect(badScope.status).toBe(400);
  });
});
