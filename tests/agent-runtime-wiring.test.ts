import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { initAgentHome } from "../server/system/agentHome";
import { recordMemory } from "../server/agent/memory";
import { runAgentLoop, type AgentStepEvent } from "../server/agent/loop";
import { maybeCompactAgentThread } from "../server/agent/threadCompaction";
import {
  appendThreadMessage,
  clearAgentThread,
  getAgentThread,
} from "../server/workspace/thread";

/**
 * Runtime audit probes (#155): evidence that the designed pieces actually
 * fire in a turn — not reading code alone. Each probe drives the real
 * path with a scripted model double and asserts the observable effect.
 */
describe("agent runtime wiring probes (#155)", () => {
  const TEST_ROOT = path.resolve(process.cwd(), "test-runtime-wiring-fixture");
  const TEST_USER = "runtime_wiring_user";
  const originalHome = process.env.AGENT_HOME_DIR;

  beforeEach(async () => {
    process.env.AGENT_HOME_DIR = TEST_ROOT;
    await fs.rm(TEST_ROOT, { recursive: true, force: true }).catch(() => {});
    await initAgentHome(TEST_ROOT);
    clearAgentThread(TEST_USER);
  });

  afterEach(async () => {
    if (originalHome !== undefined) process.env.AGENT_HOME_DIR = originalHome;
    else delete process.env.AGENT_HOME_DIR;
    clearAgentThread(TEST_USER);
    await fs.rm(TEST_ROOT, { recursive: true, force: true }).catch(() => {});
  });

  it("injects recalled memory and the guidelines extract into the turn prompt", async () => {
    await recordMemory({
      content: "User research topic: fusion energy breakthroughs briefing",
      category: "project_insight",
      durable: true,
      rootDir: TEST_ROOT,
    });
    let instructions = "";
    const mockClient: any = {
      chat: {
        completions: {
          create: async (params: any) => {
            if (params.stream) {
              instructions = params.messages?.[0]?.content ?? "";
              return { choices: [{ message: { role: "assistant", content: "Noted." } }] };
            }
            return { choices: [{ message: { role: "assistant", content: "Noted." } }] };
          },
        },
      },
    };
    const result = await runAgentLoop({
      prompt: "What are the latest fusion energy breakthroughs?",
      workspaceId: "ws-probe",
      llmClient: mockClient,
      onEvent: () => {},
    });
    expect(result.status).toBe("completed");
    // Recalled memory lands in the system prompt (budget-clamped).
    expect(instructions).toContain("fusion energy breakthroughs");
    // Guidelines extract is always injected.
    expect(instructions).toContain("English only");
  });

  it("compacts the thread tail past the threshold and persists the summary", async () => {
    for (let i = 0; i < 7; i++) {
      appendThreadMessage(TEST_USER, i % 2 === 0 ? "user" : "assistant", `turn message ${i}`);
    }
    const mockLlm: any = {
      chat: {
        completions: {
          create: async () => ({
            choices: [{ message: { role: "assistant", content: "Summary of seven turns." } }],
          }),
        },
      },
    };
    const compacted = await maybeCompactAgentThread({
      userId: TEST_USER,
      llmClient: mockLlm,
      modelId: "test-model",
      threshold: 2,
      keepRecent: 2,
    });
    expect(compacted).toBe(true);
    expect(getAgentThread(TEST_USER).summary).toContain("Summary of seven turns");
  });

  it("reports prefix-cache hits from Responses usage in the finish payload", async () => {
    const events: AgentStepEvent[] = [];
    const mockClient: any = {
      responses: {
        create: async () => ({
          id: "resp_cache_probe",
          usage: { input_tokens: 100, output_tokens: 5, input_tokens_details: { cached_tokens: 70 } },
          output: [{ type: "message", content: [{ type: "output_text", text: "Cached answer." }] }],
        }),
      },
    };
    const result = await runAgentLoop({
      prompt: "Hello",
      llmClient: mockClient,
      onEvent: (e) => events.push(e),
    });
    expect(result.status).toBe("completed");
    const finish = events.find((e) => e.type === "agent.finish");
    expect(finish?.payload?.cachedTokens).toBe(70);
    expect(finish?.payload?.dailyCachedTokens).toBeGreaterThanOrEqual(70);
  });
});
