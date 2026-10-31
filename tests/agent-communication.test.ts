import { describe, it, expect } from "bun:test";
import { z } from "zod";
import { runAgentLoop } from "../server/agent/loop";
import { verifyReceipts, collectReceipt } from "../server/agent/receipts";
import type { AgentTool } from "../server/agent/tools/types";

/**
 * Phase 1 (issue #170): the Agent talks like a product assistant, not a
 * debugger. Scripted-model runs pin LOOP behavior (notes, checks, prompt
 * presence) and receipt logic; the real model's verbalization is guided by
 * the new DEFAULT_SYSTEM_PROMPT block and validated in demo.
 *
 * Self-contained doubles (same shape as agent-skills-scenarios.test.ts).
 */

const INTERNALS = [
  "inspect_experience",
  "modify_plugin",
  "create_plugin",
  "find_capabilities",
  "userApproved",
  "approval_required",
  "slop_violation",
  "sandbox.exec",
  "Receipt check",
  "ok:true",
];

function fakeTool(name: string, calls: string[]): AgentTool {
  return {
    name,
    description: `test double for ${name}`,
    schema: z.object({}).passthrough(),
    execute: async () => {
      calls.push(name);
      if (name === "inspect_experience") {
        return { success: true, id: "bitcoin-pricing-view", errors: [], isHealthy: true };
      }
      if (name === "modify_plugin") {
        return { success: true, pluginId: "bitcoin-pricing-view", version: "2.0.0" };
      }
      return { success: true, action: name };
    },
  };
}

function scriptedLlm(steps: Array<{ toolCalls?: Array<{ name: string; args?: unknown }>; content?: string }>) {
  let i = 0;
  return {
    chat: {
      completions: {
        create: async () => {
          const step = steps[Math.min(i++, steps.length - 1)];
          if (step.toolCalls) {
            return {
              choices: [
                {
                  message: {
                    role: "assistant",
                    tool_calls: step.toolCalls.map((c, n) => ({
                      id: `call_${i}_${n}`,
                      type: "function",
                      function: { name: c.name, arguments: JSON.stringify(c.args ?? {}) },
                    })),
                  },
                },
              ],
            };
          }
          return { choices: [{ message: { role: "assistant", content: step.content ?? "done" } }] };
        },
      },
    },
  };
}

async function runScenario(
  prompt: string,
  toolNames: string[],
  steps: Parameters<typeof scriptedLlm>[0]
) {
  const calls: string[] = [];
  const started: string[] = [];
  let finishPayload: any = null;
  const result = await runAgentLoop({
    prompt,
    tools: toolNames.map((n) => fakeTool(n, calls)),
    llmClient: scriptedLlm(steps) as any,
    onEvent: async (e: any) => {
      if (e.type === "tool.start") started.push(e.payload?.name);
      if (e.type === "agent.finish") finishPayload = e.payload;
    },
  });
  return { calls, started, result, finishPayload };
}

function expectNoInternals(text: string) {
  for (const token of INTERNALS) {
    expect(text, `user-facing text must not expose "${token}"`).not.toContain(token);
  }
}

describe("receipt claims vs non-claims (#154 fixtures, #170 requirement 3a)", () => {
  const noReceipts = [collectReceipt("list_tabs", {}, { ok: true, data: {} })];

  it("negation is not a completion claim", () => {
    const out = verifyReceipts(
      "I don't install anything without your explicit yes.",
      "Install the timer.",
      noReceipts
    );
    expect(out.ok).toBe(true);
  });

  it("a question is not a completion claim", () => {
    const out = verifyReceipts(
      "Want me to install it? I won't install anything without asking first.",
      "Install the timer.",
      noReceipts
    );
    expect(out.ok).toBe(true);
  });

  it("future intention is not a completion claim", () => {
    const out = verifyReceipts(
      "I will install it once you confirm.",
      "Install the timer.",
      noReceipts
    );
    expect(out.ok).toBe(true);
  });

  it("capability offers and conditionals are not completion claims", () => {
    expect(
      verifyReceipts("I can install plugins for you.", "What can you do?", noReceipts).ok
    ).toBe(true);
    expect(
      verifyReceipts("If you approve, I'll create the tab.", "Build a tab.", noReceipts).ok
    ).toBe(true);
  });

  it("affirmative past-tense claims without receipts still fail", () => {
    expect(
      verifyReceipts("Installed the tracker.", "Build a tracker.", noReceipts).ok
    ).toBe(false);
    // Cue AFTER the verb does not rescue the claim.
    expect(
      verifyReceipts("Installed without issues.", "Build a tracker.", noReceipts).ok
    ).toBe(false);
  });
});

describe("agent communication behavior (scripted model)", () => {
  it("redesign completes with an outcome-focused final response, no internals", async () => {
    const { result, finishPayload, calls } = await runScenario(
      "Give the bitcoin pricing view a full visual refresh",
      ["inspect_experience", "modify_plugin"],
      [
        { toolCalls: [{ name: "inspect_experience", args: { id: "bitcoin-pricing-view" } }] },
        { toolCalls: [{ name: "modify_plugin", args: { id: "bitcoin-pricing-view", changeSummary: "visual refresh" } }] },
        { content: "Gave Bitcoin a full visual refresh — same feed, ranges and history." },
      ]
    );
    expect(result.status).toBe("completed");
    expect(calls).toEqual(["inspect_experience", "modify_plugin"]);
    expect(finishPayload?.receiptCheck?.ok).toBe(true);
    expectNoInternals(result.text);
  });

  it("unconfirmed claims get a natural note, never raw check mechanics", async () => {
    const { result, finishPayload } = await runScenario(
      "Build a reading tracker",
      ["inspect_experience"],
      [
        { toolCalls: [{ name: "inspect_experience", args: { id: "reading-list-tracker" } }] },
        { content: "Installed the tracker and opened it in your dock." },
      ]
    );
    expect(finishPayload?.receiptCheck?.ok).toBe(false);
    expect(result.text).toContain("couldn't confirm");
    expectNoInternals(result.text);
  });

  it("honest refusal to install triggers no receipt violation and no note", async () => {
    const { result, finishPayload } = await runScenario(
      "Install the timer",
      ["list_tabs"],
      [{ content: "I don't install anything without your explicit yes." }]
    );
    expect(finishPayload?.receiptCheck?.ok).toBe(true);
    expect(result.text).toBe("I don't install anything without your explicit yes.");
    expectNoInternals(result.text);
  });

  it("simple questions get simple answers with no tool narration", async () => {
    const { result, started, finishPayload } = await runScenario(
      "What is stoicism?",
      ["search_web", "list_tabs"],
      [{ content: "Stoicism teaches the dichotomy of control." }]
    );
    expect(result.status).toBe("completed");
    expect(started).toEqual([]);
    expect(finishPayload?.receiptCheck?.ok).toBe(true);
    expect(result.text).toBe("Stoicism teaches the dichotomy of control.");
  });

  it("the shared system prompt carries the product-voice rule", async () => {
    const { readFileSync } = await import("node:fs");
    const prompt = readFileSync("server/agent/prompts/main.md", "utf-8");
    expect(prompt).toContain("Speak about outcomes, never mechanisms");
    expect(prompt).toContain("no tool names, permission flags, or execution codes");
  });
});
