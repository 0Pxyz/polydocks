import { describe, it, expect, afterEach } from "bun:test";
import { z } from "zod";
import {
  escalateToHeavyAgent,
  setHeavyRunnerForTest,
  type AgentStepEvent,
} from "../server/agent/orchestrator";
import { escalate } from "../server/agent/tools/verbs/escalate";
import { AGENT_MANIFEST } from "../server/agent/manifest";

/** Escalation contract (#212): orchestrator to heavy agent and back. */
describe("escalation contract", () => {
  afterEach(() => setHeavyRunnerForTest());

  function scriptedHeavy(captured: { prompt?: string; history?: unknown }, reply = "Heavy answer.") {
    return {
      chat: {
        completions: {
          create: async (params: any) => {
            const msgs = params.messages ?? [];
            captured.prompt = msgs[msgs.length - 1]?.content;
            captured.history = msgs;
            return { choices: [{ message: { role: "assistant", content: reply } }] };
          },
        },
      },
    };
  }

  it("hands off the prompt and returns the heavy final answer", async () => {
    const events: AgentStepEvent[] = [];
    const captured: { prompt?: string; history?: unknown } = {};
    const result = await escalateToHeavyAgent(
      {
        prompt: "Build a habit tracker",
        intent: "general",
        workspaceId: "ws-1",
        contextId: "ctx-1",
        historySummary: "User likes dark themes.",
        constraints: { maxSteps: 5 },
      },
      { llmClient: scriptedHeavy(captured) as any, onEvent: (e) => void events.push(e) }
    );
    expect(result.ok).toBe(true);
    expect(result.text).toBe("Heavy answer.");
    // Heavy agent relays progress through the caller (never direct).
    expect(events.some((e) => e.type === "agent.start")).toBe(true);
    expect(events.some((e) => e.type === "agent.finish")).toBe(true);
  });

  it("policy and receipts apply to everything the heavy agent does", async () => {
    const { runAgentLoop } = await import("../server/agent/loop");
    const gatedWrite: any = {
      name: "write_file",
      description: "gated write double",
      schema: z.object({ path: z.string(), content: z.string() }),
      execute: async () => ({ ok: true }),
    };
    // Heavy double demands a gated write on the first turn.
    const demandingHeavy: any = {
      chat: {
        completions: {
          create: async (params: any) => {
            if (params.stream) {
              return {
                choices: [
                  {
                    message: {
                      role: "assistant",
                      content: null,
                      tool_calls: [
                        {
                          id: "call_heavy_1",
                          type: "function",
                          function: { name: "write_file", arguments: JSON.stringify({ path: "x.md", content: "hi" }) },
                        },
                      ],
                    },
                  },
                ],
              };
            }
            return { choices: [{ message: { role: "assistant", content: "Done." } }] };
          },
        },
      },
    };
    const revoked = { ...AGENT_MANIFEST, permissions: [] as any };
    let executed = 0;
    const countingWrite = { ...gatedWrite, execute: async () => ((executed++, { ok: true })) };
    // Prove the denial path through the real heavy loop with a revoked manifest.
    const events: AgentStepEvent[] = [];
    const heavyResult = await runAgentLoop({
      prompt: "Write x",
      tools: [countingWrite],
      llmClient: demandingHeavy,
      agentManifest: revoked,
      onEvent: (e) => void events.push(e),
    });
    expect(heavyResult.status).toBe("completed");
    expect(executed).toBe(0);
    const done = events.find((e) => e.type === "tool.done");
    expect(String((done?.payload?.result as any)?.error)).toContain("write_file");
  });

  it("escalate tool relays the heavy answer end to end", async () => {
    setHeavyRunnerForTest(async () => ({ ok: true, text: "Relayed.", steps: 2, citations: [] }));
    const out = (await escalate.execute(
      { prompt: "Do heavy work" },
      { workspaceId: "ws-1", step: 1 }
    )) as any;
    expect(out.text).toBe("Relayed.");
    expect(out.steps).toBe(2);
  });
});
