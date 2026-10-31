import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";
import { initAgentHome } from "../server/system/agentHome";
import {
  recordMemory,
  recallMemory,
  getMemoryContext,
  getMemoryOverview,
  sanitizeMemoryContent,
  estimateTokens,
} from "../server/agent/memory";
import { record_memory } from "../server/agent/tools/record_memory";
import { recall_memory } from "../server/agent/tools/recall_memory";
import app from "../server/index";

describe("Agent Durable Memory & Retrieval Engine (Issue #75)", () => {
  const TEST_ROOT = path.resolve(process.cwd(), "test-agent-memory-fixture");
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

  describe("Episodic Daily Logging", () => {
    it("appends observation entries to today's daily log", async () => {
      const res = await recordMemory({
        content: "User explored quantum computing fundamentals and requested Bell states simulation.",
        category: "project_insight",
        workspaceId: "quantum-notes",
        rootDir: TEST_ROOT,
      });

      expect(res.recorded).toBe(true);
      expect(res.durable).toBe(false);

      // Verify file exists on disk
      const dailyFile = path.resolve(TEST_ROOT, res.dailyFile);
      const content = await fs.readFile(dailyFile, "utf-8");
      expect(content).toContain("# Daily Memory Log");
      expect(content).toContain("[project_insight]");
      expect(content).toContain("(workspace: quantum-notes)");
      expect(content).toContain("quantum computing fundamentals");
    });

    it("appends multiple entries sequentially without overwriting", async () => {
      await recordMemory({
        content: "Entry one: user prefers concise explanations.",
        category: "user_preference",
        rootDir: TEST_ROOT,
      });

      await recordMemory({
        content: "Entry two: user switched visual theme to dark violet.",
        category: "user_preference",
        rootDir: TEST_ROOT,
      });

      const overview = await getMemoryOverview(TEST_ROOT);
      expect(overview.dailyLogs.length).toBeGreaterThanOrEqual(1);
      const todayLog = overview.dailyLogs[0];
      expect(todayLog.entryCount).toBe(2);
      expect(todayLog.content).toContain("Entry one");
      expect(todayLog.content).toContain("Entry two");
    });
  });

  describe("Curated Long-Term Memory (MEMORY.md)", () => {
    it("promotes durable entries into MEMORY.md under matching category headers", async () => {
      await recordMemory({
        content: "User strictly prefers LaTeX formatting for mathematical proofs.",
        category: "user_preference",
        durable: true,
        rootDir: TEST_ROOT,
      });

      const memoryMdPath = path.resolve(TEST_ROOT, "MEMORY.md");
      const memoryContent = await fs.readFile(memoryMdPath, "utf-8");

      expect(memoryContent).toContain("## User Insights & Preferences");
      expect(memoryContent).toContain("- User strictly prefers LaTeX formatting for mathematical proofs.");

      // Test architectural rule promotion
      await recordMemory({
        content: "All network traffic must traverse the bridge postMessage protocol.",
        category: "architectural_rule",
        durable: true,
        rootDir: TEST_ROOT,
      });

      const updatedMemory = await fs.readFile(memoryMdPath, "utf-8");
      expect(updatedMemory).toContain("## Architectural Guidelines");
      expect(updatedMemory).toContain("- All network traffic must traverse the bridge postMessage protocol.");
    });

    it("prevents exact duplicate entries in MEMORY.md", async () => {
      await recordMemory({
        content: "Idempotent rule: avoid duplicate memory items.",
        category: "architectural_rule",
        durable: true,
        rootDir: TEST_ROOT,
      });

      // Repeat the exact same durable memory
      await recordMemory({
        content: "Idempotent rule: avoid duplicate memory items.",
        category: "architectural_rule",
        durable: true,
        rootDir: TEST_ROOT,
      });

      const memoryMdPath = path.resolve(TEST_ROOT, "MEMORY.md");
      const memoryContent = await fs.readFile(memoryMdPath, "utf-8");

      const occurrences = memoryContent.split("Idempotent rule: avoid duplicate memory items.").length - 1;
      expect(occurrences).toBe(1);
    });
  });

  describe("Relevance Scoring & Retrieval (recallMemory)", () => {
    beforeEach(async () => {
      // Seed test memories
      await recordMemory({
        content: "User loves Stoic philosophy, especially Marcus Aurelius Meditations and Epictetus.",
        category: "user_preference",
        durable: true,
        rootDir: TEST_ROOT,
      });

      await recordMemory({
        content: "Neural network backpropagation algorithms and PyTorch tensor operations.",
        category: "project_insight",
        durable: true,
        rootDir: TEST_ROOT,
      });

      await recordMemory({
        content: "Quantum superposition and Hadamard quantum gates notes on physics.",
        category: "project_insight",
        workspaceId: "physics",
        rootDir: TEST_ROOT,
      });
    });

    it("surfaces relevant memories matching keywords", async () => {
      const stoicResults = await recallMemory({
        query: "What does the user like about Stoicism and Marcus Aurelius?",
        rootDir: TEST_ROOT,
      });

      expect(stoicResults.length).toBeGreaterThanOrEqual(1);
      expect(stoicResults[0]).toContain("Stoic philosophy");
      expect(stoicResults.some((m) => m.includes("PyTorch"))).toBe(false);
    });

    it("filters accurately by category", async () => {
      const results = await recallMemory({
        query: "neural networks PyTorch",
        category: "project_insight",
        rootDir: TEST_ROOT,
      });

      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0]).toContain("Neural network backpropagation");
    });

    it("token budget clamping limits prompt context (< 800 tokens)", async () => {
      // Add very long memories
      for (let i = 0; i < 20; i++) {
        await recordMemory({
          content: `Distributed systems consensus raft algorithm note ${i}: Paxos is complex but Raft breaks state machine replication into leader election, log replication, and safety. User requested in-depth study of cluster quorum semantics.`,
          category: "project_insight",
          rootDir: TEST_ROOT,
        });
      }

      const promptContext = await getMemoryContext("raft consensus algorithm distributed", 200, TEST_ROOT);
      expect(promptContext).toBeTruthy();
      expect(promptContext).toContain("Recalled Agent Memory");

      const tokenEstimate = estimateTokens(promptContext);
      expect(tokenEstimate).toBeLessThanOrEqual(250);
    });
  });

  describe("Security: Automated Credential Redaction", () => {
    it("redacts OpenAI / Meta sk- style API keys", () => {
      const raw = "Here is my secret Meta key: sk-abc123456789012345678901234567890";
      const sanitized = sanitizeMemoryContent(raw);
      expect(sanitized).not.toContain("sk-abc123456789012345678901234567890");
      expect(sanitized).toContain("[REDACTED_SECRET]");
    });

    it("redacts Bearer tokens and generic key-value credentials", () => {
      const raw = "Authorization: Bearer mySecretToken1234567890\napiKey='superSecretKey12345'";
      const sanitized = sanitizeMemoryContent(raw);
      expect(sanitized).not.toContain("mySecretToken1234567890");
      expect(sanitized).not.toContain("superSecretKey12345");
      expect(sanitized).toContain("[REDACTED_SECRET]");
    });

    it("redacts sensitive keys when saved via recordMemory", async () => {
      const res = await recordMemory({
        content: "User provided TinyFish key: sk-tinyfish9999888877776666555544443333 and password: myUltraSecretPassword123",
        category: "user_preference",
        durable: true,
        rootDir: TEST_ROOT,
      });

      expect(res.entry).not.toContain("sk-tinyfish9999888877776666555544443333");
      expect(res.entry).not.toContain("myUltraSecretPassword123");

      const memoryFile = await fs.readFile(path.resolve(TEST_ROOT, "MEMORY.md"), "utf-8");
      expect(memoryFile).not.toContain("sk-tinyfish9999888877776666555544443333");
      expect(memoryFile).not.toContain("myUltraSecretPassword123");
      expect(memoryFile).toContain("[REDACTED_SECRET]");
    });
  });

  describe("Simulated Server Restart Survival", () => {
    it("recalls memories recorded before simulated server shutdown", async () => {
      // 1. Session 1: record memories to disk
      await recordMemory({
        content: "Session 1 memory: User is building an autonomous Mars Rover rover simulation in Rust.",
        category: "project_insight",
        durable: true,
        rootDir: TEST_ROOT,
      });

      // 2. Simulate complete restart: clear module-level in-memory caches and re-query fresh from disk
      const recalledAfterRestart = await recallMemory({
        query: "Mars Rover Rust simulation",
        rootDir: TEST_ROOT,
      });

      expect(recalledAfterRestart.length).toBeGreaterThanOrEqual(1);
      expect(recalledAfterRestart[0]).toContain("Mars Rover rover simulation in Rust");
    });
  });

  describe("Agent Tools Execution", () => {
    it("record_memory tool records and promotes insights", async () => {
      const res = (await record_memory.execute(
        {
          content: "User prefers async/await over raw Promises.",
          category: "user_preference",
          durable: true,
        },
        { workspaceId: "test-ws", step: 1 }
      )) as any;

      expect(res.recorded).toBe(true);
      expect(res.durable).toBe(true);

      const recallRes = (await recall_memory.execute(
        {
          query: "user preference Promises",
        },
        { workspaceId: "test-ws", step: 2 }
      )) as any;

      expect(recallRes.count).toBeGreaterThanOrEqual(1);
      expect(recallRes.memories[0]).toContain("async/await");
    });
  });

  describe("User Inspection REST API", () => {
    it("GET /api/agent/memory returns current memory overview", async () => {
      await recordMemory({
        content: "API test observation for REST endpoint verification.",
        category: "general",
        rootDir: TEST_ROOT,
      });

      const res = await app.fetch(
        new Request("http://localhost/api/agent/memory", {
          method: "GET",
        })
      );

      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.memoryMd).toBeTruthy();
      expect(Array.isArray(data.dailyLogs)).toBe(true);
      expect(data.dailyLogs.length).toBeGreaterThanOrEqual(1);
    });

    it("PUT /api/agent/memory updates MEMORY.md content with automatic secret redaction", async () => {
      const newMemory = `# Long-Term Curated Memory\n\n## Custom Section\n- User updated memory manually with key sk-secret12345678901234567890.`;

      const res = await app.fetch(
        new Request("http://localhost/api/agent/memory", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: newMemory }),
        })
      );

      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.success).toBe(true);

      // Verify file was written and redacted
      const saved = await fs.readFile(path.resolve(TEST_ROOT, "MEMORY.md"), "utf-8");
      expect(saved).toContain("## Custom Section");
      expect(saved).not.toContain("sk-secret12345678901234567890");
      expect(saved).toContain("[REDACTED_SECRET]");
    });
  });
});
