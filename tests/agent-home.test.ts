import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";
import {
  initAgentHome,
  getAgentHomeRoot,
  getAgentHomePath,
  getMemoryPath,
  getSessionsPath,
  getWorkspacesPath,
  getPluginsPath,
  getTasksPath,
  getArtifactsPath,
  getSettingsPath,
  AGENT_HOME_SUBDIRS,
  BASELINE_TEMPLATES,
} from "../server/system/agentHome";

describe("Agent Home Persistent Filesystem (Issue #73)", () => {
  const TEST_ROOT = path.resolve(process.cwd(), "test-agent-home-fixture");
  const originalEnv = process.env.AGENT_HOME_DIR;

  beforeEach(async () => {
    delete process.env.AGENT_HOME_DIR;
    await fs.rm(TEST_ROOT, { recursive: true, force: true }).catch(() => {});
  });

  afterEach(async () => {
    if (originalEnv !== undefined) {
      process.env.AGENT_HOME_DIR = originalEnv;
    } else {
      delete process.env.AGENT_HOME_DIR;
    }
    await fs.rm(TEST_ROOT, { recursive: true, force: true }).catch(() => {});
  });

  it("resolves default root to <cwd>/agent-home and respects AGENT_HOME_DIR override", () => {
    delete process.env.AGENT_HOME_DIR;
    expect(getAgentHomeRoot()).toBe(path.resolve(process.cwd(), "agent-home"));

    process.env.AGENT_HOME_DIR = "/custom/agent-home-path";
    expect(getAgentHomeRoot()).toBe(path.resolve("/custom/agent-home-path"));

    process.env.AGENT_HOME_DIR = "relative/agent-home";
    expect(getAgentHomeRoot()).toBe(path.resolve(process.cwd(), "relative/agent-home"));
  });

  it("resolves strongly-typed path helpers relative to agent-home root", () => {
    process.env.AGENT_HOME_DIR = TEST_ROOT;

    expect(getAgentHomePath("AGENTS.md")).toBe(path.join(TEST_ROOT, "AGENTS.md"));
    expect(getMemoryPath("2026-10-28.md")).toBe(path.join(TEST_ROOT, "memory", "2026-10-28.md"));
    expect(getSessionsPath("session-1.jsonl")).toBe(path.join(TEST_ROOT, "sessions", "session-1.jsonl"));
    expect(getWorkspacesPath("city-1")).toBe(path.join(TEST_ROOT, "workspaces", "city-1"));
    expect(getPluginsPath("wiki")).toBe(path.join(TEST_ROOT, "plugins", "wiki"));
    expect(getTasksPath("task-42.json")).toBe(path.join(TEST_ROOT, "tasks", "task-42.json"));
    expect(getArtifactsPath("deliverable.html")).toBe(path.join(TEST_ROOT, "artifacts", "deliverable.html"));
    expect(getSettingsPath("config.json")).toBe(path.join(TEST_ROOT, "settings", "config.json"));
  });

  it("bootstraps all subdirectories and seeds baseline template markdown files", async () => {
    const res = await initAgentHome(TEST_ROOT);

    expect(res.root).toBe(TEST_ROOT);
    expect(res.subdirs).toEqual([...AGENT_HOME_SUBDIRS]);
    expect(res.filesCreated.sort()).toEqual(Object.keys(BASELINE_TEMPLATES).sort());
    expect(res.filesPreserved).toEqual([]);

    // Verify all subdirectories exist on disk
    for (const subdir of AGENT_HOME_SUBDIRS) {
      const stats = await fs.stat(path.join(TEST_ROOT, subdir));
      expect(stats.isDirectory()).toBe(true);
    }

    // Verify all baseline markdown templates exist with non-empty content
    for (const filename of Object.keys(BASELINE_TEMPLATES)) {
      const filePath = path.join(TEST_ROOT, filename);
      const content = await fs.readFile(filePath, "utf-8");
      expect(content.length).toBeGreaterThan(50);
      expect(content).toBe(BASELINE_TEMPLATES[filename]);
    }
  });

  it("strictly preserves existing user edits across re-initialization (idempotent)", async () => {
    // 1. Initial creation
    await initAgentHome(TEST_ROOT);

    // 2. Modify AGENTS.md and SOUL.md with custom user rules
    const customAgentsContent = "# Custom Guidelines\nUser custom rule here.";
    const customSoulContent = "# Custom Identity\nCustom persona.";
    await fs.writeFile(path.join(TEST_ROOT, "AGENTS.md"), customAgentsContent, "utf-8");
    await fs.writeFile(path.join(TEST_ROOT, "SOUL.md"), customSoulContent, "utf-8");

    // 3. Re-run initialization
    const secondRes = await initAgentHome(TEST_ROOT);

    // No files should be recreated; all 4 should be preserved
    expect(secondRes.filesCreated).toEqual([]);
    expect(secondRes.filesPreserved.sort()).toEqual(Object.keys(BASELINE_TEMPLATES).sort());

    // User edits must remain completely intact
    const agentsAfter = await fs.readFile(path.join(TEST_ROOT, "AGENTS.md"), "utf-8");
    const soulAfter = await fs.readFile(path.join(TEST_ROOT, "SOUL.md"), "utf-8");
    expect(agentsAfter).toBe(customAgentsContent);
    expect(soulAfter).toBe(customSoulContent);
  });
});
