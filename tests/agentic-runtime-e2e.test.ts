import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "os";
import { spawnSync } from "node:child_process";
import app from "../server/index";
import { initAgentHome } from "../server/system/agentHome";
import { recordMemory, recallMemory } from "../server/agent/memory";
import {
  createSession,
  getSession,
  createTask,
  getTask,
  readSessionTranscript,
  TaskExecutionEngine,
} from "../server/agent/taskRunner";
import {
  writeFileSafe,
  readFileSafe,
  editFileSafe,
  resolveSafeAgentPath,
} from "../server/system/filesystem";

describe("PolyDocks V2 Agentic Runtime End-to-End Integration Benchmark (Issue #81)", () => {
  let tmpAgentHome: string;
  const originalAgentHome = process.env.AGENT_HOME_DIR;

  beforeEach(async () => {
    tmpAgentHome = await fs.mkdtemp(path.join(os.tmpdir(), "agentic-runtime-e2e-"));
    process.env.AGENT_HOME_DIR = tmpAgentHome;
    await initAgentHome(tmpAgentHome);
  });

  afterEach(async () => {
    if (originalAgentHome) {
      process.env.AGENT_HOME_DIR = originalAgentHome;
    } else {
      delete process.env.AGENT_HOME_DIR;
    }
    await fs.rm(tmpAgentHome, { recursive: true, force: true }).catch(() => {});
  });

  // =========================================================================
  // STAGE 1: Agent Home & Durable Memory Survival Across Runtime Restarts
  // =========================================================================
  describe("Stage 1: Agent Home & Durable Memory Survival Across Restarts", () => {
    it("persists user preferences to MEMORY.md and recalls them accurately after simulated restart", async () => {
      // 1. Initial agent runtime records user preference
      const recorded = await recordMemory({
        content: "User preference: dark-mode strict, prefers pomodoro 25/5 focus cycles",
        category: "user_preference",
        durable: true,
        rootDir: tmpAgentHome,
      });
      expect(recorded.recorded).toBe(true);
      expect(recorded.durable).toBe(true);

      // Verify physical disk persistence
      const memoryMdPath = path.join(tmpAgentHome, "MEMORY.md");
      const diskContentBefore = await fs.readFile(memoryMdPath, "utf-8");
      expect(diskContentBefore).toContain("pomodoro 25/5 focus cycles");

      // 2. Simulate complete runtime restart:
      // Re-bootstrap agent home from scratch on the existing directory
      await initAgentHome(tmpAgentHome);

      // 3. New session queries memory engine
      const recalled = await recallMemory({
        query: "pomodoro focus intervals",
        rootDir: tmpAgentHome,
      });

      expect(Array.isArray(recalled)).toBe(true);
      expect(recalled.length).toBeGreaterThan(0);
      expect(recalled.some((m) => m.includes("pomodoro 25/5 focus cycles"))).toBe(true);
      expect(recalled.some((m) => m.includes("dark-mode strict"))).toBe(true);
    });
  });

  // =========================================================================
  // STAGE 2: Multi-Workspace Session Isolation & Background Task Execution
  // =========================================================================
  describe("Stage 2: Multi-Workspace Session Isolation & Background Tasks", () => {
    it("executes background tasks asynchronously and preserves session transcript isolation", async () => {
      const workspaceA = `ws_alpha_${Date.now()}`;
      const workspaceB = `ws_beta_${Date.now()}`;

      // 1. Create concurrent sessions in isolated workspaces
      const sessionA = createSession({
        workspaceId: workspaceA,
        title: "Workspace Alpha Research",
        rootDir: tmpAgentHome,
      });
      const sessionB = createSession({
        workspaceId: workspaceB,
        title: "Workspace Beta Exploration",
        rootDir: tmpAgentHome,
      });

      expect(sessionA.id).toBeDefined();
      expect(sessionB.id).toBeDefined();
      expect(sessionA.workspaceId).not.toEqual(sessionB.workspaceId);

      // 2. Dispatch a background task attached to Session A
      const customEngine = TaskExecutionEngine.getInstance();
      const task = createTask({
        sessionId: sessionA.id,
        workspaceId: workspaceA,
        description: "Background synthesis of quantum mechanics overview",
        rootDir: tmpAgentHome,
      });

      expect(task.status).toBe("queued");

      // Execute background task
      void customEngine.runTaskInBackground(
        task,
        {
          executor: async (_t, _sig, emit) => {
            await emit({
              step: 1,
              type: "tool.done",
              payload: { tool: "write_notes", topic: "Quantum Mechanics" },
            });
            return { summary: "Quantum mechanics principles synthesized successfully." };
          },
          rootDir: tmpAgentHome,
        }
      );

      // 3. Verify Session B remains unaffected during Session A's background execution
      const retrievedSessionB = getSession(sessionB.id, workspaceB);
      expect(retrievedSessionB?.workspaceId).toBe(workspaceB);
      expect(retrievedSessionB?.status).toBe("active");

      // Poll until task finishes
      let completedTask: any = null;
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 25));
        completedTask = getTask(task.id);
        if (completedTask?.status === "completed") break;
      }

      // 4. Assert task status transitioned to completed in SQLite
      expect(completedTask?.status).toBe("completed");
      expect(completedTask?.progress).toBe(1.0);
      expect((completedTask?.output as any)?.summary).toContain("synthesized successfully");

      // 5. Assert Session A transcript persisted to JSONL
      const transcriptA = await readSessionTranscript(sessionA.id, { rootDir: tmpAgentHome });
      expect(transcriptA.length).toBeGreaterThan(0);
      expect(
        transcriptA.some(
          (e) => e.type === "tool.done" && (e.payload as any)?.tool === "write_notes"
        )
      ).toBe(true);

      // Verify Session B transcript remains empty / independent
      const transcriptB = await readSessionTranscript(sessionB.id, { rootDir: tmpAgentHome });
      expect(transcriptB.length).toBe(0);
    });
  });

  // =========================================================================
  // STAGE 3: Filesystem Operator, Targeted Edit & Path Traversal Confinement
  // =========================================================================
  describe("Stage 3: Filesystem Operator, Targeted Edit & Path Traversal Guards", () => {
    it("safely generates artifacts, executes exact targeted edits, and blocks path traversal", async () => {
      const artifactRelPath = "artifacts/stoic-report.md";

      // 1. Create initial deliverable artifact
      const initialContent = [
        "# Stoic Philosophy Overview",
        "",
        "## Core Principles",
        "- Dichotomy of Control: Focus on what you control.",
        "- Amor Fati: Love your fate.",
        "",
        "## Reading List",
        "- Meditations by Marcus Aurelius",
      ].join("\n");

      await writeFileSafe(artifactRelPath, initialContent, { rootDir: tmpAgentHome });

      const readResult = await readFileSafe(artifactRelPath, { rootDir: tmpAgentHome });
      expect(readResult.content).toContain("Amor Fati: Love your fate.");

      // 2. Perform exact surgical edit via editFileSafe
      const editResult = await editFileSafe(
        artifactRelPath,
        "- Amor Fati: Love your fate.",
        "- Amor Fati: Love your fate as necessary and beneficial.\n- Memento Mori: Remember your mortality.",
        { rootDir: tmpAgentHome }
      );

      expect(editResult.replacements).toBe(1);

      const updated = await readFileSafe(artifactRelPath, { rootDir: tmpAgentHome });
      expect(updated.content).toContain("Memento Mori: Remember your mortality.");
      expect(updated.content).toContain("Amor Fati: Love your fate as necessary and beneficial.");

      // 3. Security Guard: strictly block path traversal attempts escaping agent-home
      expect(resolveSafeAgentPath("../../etc/passwd", tmpAgentHome)).rejects.toThrow(/Path traversal violation/);
      expect(resolveSafeAgentPath("/etc/shadow", tmpAgentHome)).rejects.toThrow(/Path traversal violation/);
      expect(resolveSafeAgentPath("artifacts/../../../secret.key", tmpAgentHome)).rejects.toThrow(/Path traversal violation/);
    });
  });

  // =========================================================================
  // STAGE 4: Polydocks CLI Operations & JSON Introspection
  // =========================================================================
  describe("Stage 4: Polydocks CLI Operations & JSON Serialization", () => {
    it(
      "executes CLI commands and outputs structured status, sessions, and plugins",
      () => {
      const cliBin = path.resolve(process.cwd(), "bin/polydocks");

      // 1. polydocks status --json
      const statusRes = spawnSync("bun", [cliBin, "status", "--json"], {
        encoding: "utf-8",
        env: { ...process.env, AGENT_HOME_DIR: tmpAgentHome },
      });

      expect(statusRes.status).toBe(0);
      const statusData = JSON.parse(statusRes.stdout);
      expect(statusData.status).toBe("ok");
      expect(statusData.sqlite).toBeDefined();
      expect(typeof statusData.counts?.sessions).toBe("number");
      expect(typeof statusData.counts?.runningTasks).toBe("number");

      // 2. polydocks sessions --json
      const sessionsRes = spawnSync("bun", [cliBin, "sessions", "--json"], {
        encoding: "utf-8",
        env: { ...process.env, AGENT_HOME_DIR: tmpAgentHome },
      });

      expect(sessionsRes.status).toBe(0);
      const sessionsList = JSON.parse(sessionsRes.stdout);
      expect(Array.isArray(sessionsList)).toBe(true);

      // 3. polydocks plugins --json
      const pluginsRes = spawnSync("bun", [cliBin, "plugins", "--json"], {
        encoding: "utf-8",
        env: { ...process.env, AGENT_HOME_DIR: tmpAgentHome },
      });

      expect(pluginsRes.status).toBe(0);
      const pluginsList = JSON.parse(pluginsRes.stdout);
      expect(Array.isArray(pluginsList)).toBe(true);
    }, 15000);
  });

  // =========================================================================
  // STAGE 5: REST Endpoints
  // =========================================================================
  describe("Stage 5: REST Endpoints", () => {
    it("serves /api/health and /api/workspaces", async () => {
      // 1. GET /api/health
      const healthRes = await app.fetch(new Request("http://localhost/api/health"));
      expect(healthRes.status).toBe(200);
      const healthBody: any = await healthRes.json();
      expect(healthBody.status).toBe("ok");
      expect(healthBody.model).toBeDefined();

      // 2. GET /api/workspaces
      const wsRes = await app.fetch(new Request("http://localhost/api/workspaces"));
      expect(wsRes.status).toBe(200);
      const wsBody: any = await wsRes.json();
      expect(wsBody.success).toBe(true);
      expect(Array.isArray(wsBody.data)).toBe(true);

      // 3. Retired city/world routes stay gone
      for (const path of ["/api/cities", "/api/maps", "/api/world", "/api/mcp"]) {
        const res = await app.fetch(new Request(`http://localhost${path}`));
        expect(res.status).toBe(404);
      }
    });
  });
});
