import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";
import { initAgentHome } from "../server/system/agentHome";
import { SessionService, TaskService } from "../server/services";

const CLI_PATH = path.resolve(process.cwd(), "bin/polydocks");

describe("PolyDocks CLI Runtime Management (Issue #78)", () => {
  const TEST_ROOT = path.resolve(process.cwd(), "test-cli-fixture");
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

  async function runCli(args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    const proc = Bun.spawn(["bun", CLI_PATH, ...args], {
      env: {
        ...process.env,
        AGENT_HOME_DIR: TEST_ROOT,
        POLYMAX_CLI_MOCK_LLM: "true",
      },
      stdout: "pipe",
      stderr: "pipe",
    });

    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);

    const exitCode = await proc.exited;
    return { exitCode, stdout, stderr };
  }

  describe("polydocks status", () => {
    it("prints human-readable runtime status table", async () => {
      const { exitCode, stdout } = await runCli(["status"]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("PolyDocks Runtime Status");
      expect(stdout).toContain("Port:");
      expect(stdout).toContain("SQLite WAL:");
      expect(stdout).toContain("Workspaces:");
    });

    it("outputs valid JSON with --json flag", async () => {
      const { exitCode, stdout } = await runCli(["status", "--json"]);
      expect(exitCode).toBe(0);
      const data = JSON.parse(stdout);
      expect(data.status).toBe("ok");
      expect(typeof data.port).toBe("number");
      expect(data.sqlite.ok).toBe(true);
      expect(typeof data.counts.workspaces).toBe("number");
    });
  });

  describe("polydocks sessions", () => {
    it("lists sessions formatted and with --json", async () => {
      const sess = await SessionService.createSession({
        workspaceId: "default",
        title: "CLI Test Session",
      });

      const { exitCode, stdout } = await runCli(["sessions", "list"]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain(sess.id);
      expect(stdout).toContain("CLI Test Session");

      const jsonRes = await runCli(["sessions", "list", "--json"]);
      expect(jsonRes.exitCode).toBe(0);
      const list = JSON.parse(jsonRes.stdout);
      expect(Array.isArray(list)).toBe(true);
      expect(list.some((s: any) => s.id === sess.id)).toBe(true);
    });

    it("resumes session transcript", async () => {
      const sess = await SessionService.createSession({
        workspaceId: "default",
        title: "Resume Session",
      });
      await SessionService.appendTranscript(
        sess.id,
        { step: 1, type: "agent.start", prompt: "Hello" },
        TEST_ROOT
      );

      const { exitCode, stdout } = await runCli(["sessions", "resume", sess.id]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("Resume Session");
      expect(stdout).toContain("agent.start");

      const jsonRes = await runCli(["sessions", "resume", sess.id, "--json"]);
      expect(jsonRes.exitCode).toBe(0);
      const data = JSON.parse(jsonRes.stdout);
      expect(data.session.id).toBe(sess.id);
      expect(Array.isArray(data.transcript)).toBe(true);
    });
  });

  describe("polydocks tasks", () => {
    it("lists background tasks and filters by status", async () => {
      const sess = await SessionService.createSession({ workspaceId: "default" });
      const task = await TaskService.createTask({
        sessionId: sess.id,
        workspaceId: "default",
        type: "research",
      });

      const { exitCode, stdout } = await runCli(["tasks", "list"]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain(task.id);
      expect(stdout).toContain("research");

      const jsonRes = await runCli(["tasks", "list", "--json"]);
      expect(jsonRes.exitCode).toBe(0);
      const tasks = JSON.parse(jsonRes.stdout);
      expect(tasks.some((t: any) => t.id === task.id)).toBe(true);
    });
  });

  describe("polydocks plugins", () => {
    it("lists installed plugins and inspects manifest", async () => {
      const { exitCode, stdout } = await runCli(["plugins", "list"]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("VERSION");

      const inspectRes = await runCli(["plugins", "inspect", "search"]);
      expect(inspectRes.exitCode).toBe(0);
      expect(inspectRes.stdout).toContain("Web Discovery & Research");
      expect(inspectRes.stdout).toContain("Capabilities:");

      const jsonRes = await runCli(["plugins", "inspect", "search", "--json"]);
      expect(jsonRes.exitCode).toBe(0);
      const plugin = JSON.parse(jsonRes.stdout);
      expect(plugin.id).toBe("search");
      expect(plugin.manifest.capabilities.length).toBeGreaterThanOrEqual(1);
    });

    it("installs plugin into workspace", async () => {
      const { exitCode, stdout } = await runCli([
        "plugins",
        "install",
        "search",
        "--workspace",
        "default",
      ]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("Successfully installed plugin");

      const listRes = await runCli(["plugins", "list", "--workspace", "default", "--json"]);
      expect(listRes.exitCode).toBe(0);
      const wsPlugins = JSON.parse(listRes.stdout);
      expect(wsPlugins.some((p: any) => p.pluginId === "search")).toBe(true);
    });
  });

  describe("polydocks agent run", () => {
    it("executes an agent instruction and outputs response", async () => {
      // Mock minimal agent response or execute instruction
      const { exitCode, stdout } = await runCli(["agent", "run", "Hello world"]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("Agent Response:");
    });

    it("outputs structured result and events with --json", async () => {
      const { exitCode, stdout } = await runCli(["agent", "run", "Status ping", "--json"]);
      expect(exitCode).toBe(0);
      const data = JSON.parse(stdout);
      expect(data.result).toBeDefined();
      expect(Array.isArray(data.events)).toBe(true);
    });
  });

  describe("Error Handling & Clean Exit Codes", () => {
    it("exits with non-zero code on unknown command", async () => {
      const { exitCode, stderr } = await runCli(["foobar"]);
      expect(exitCode).toBe(1);
      expect(stderr).toContain("Unknown command");
    });

    it("exits with non-zero code when inspect target is not found", async () => {
      const { exitCode, stderr } = await runCli(["plugins", "inspect", "non-existent-plugin"]);
      expect(exitCode).toBe(1);
      expect(stderr).toContain("not found");
    });
  });
});
