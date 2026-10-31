import { describe, it, expect } from "bun:test";
import { z } from "zod";
import { runAgentLoop } from "../server/agent/loop";
import {
  verifyReceipts,
  collectReceipt,
  summarizeCompletion,
  type TurnReceipt,
} from "../server/agent/receipts";
import type { AgentTool } from "../server/agent/tools/types";

/**
 * Phase 2 (issue #170): Updated / Mounted / Verified / Failed.
 * Saves the reported live failure as executable truth: the agent said
 * "Ready" and "is live", then the plugin failed to mount. Only a healthy
 * read-back (inspect ok, isHealthy, verification ok) earns ready/load
 * language; pixel truth is never claimable; failures must surface.
 */

const PROMPT = "Give the bitcoin pricing view a full visual refresh";

function healthyInspect() {
  // Real inspect_experience shape: experience at the top level.
  return {
    success: true,
    experience: { id: "bitcoin-pricing-view", isHealthy: true, verification: { ok: true } },
  };
}

function receiptsOf(entries: Array<[string, unknown, unknown]>): TurnReceipt[] {
  return entries.map(([tool, args, output]) => collectReceipt(tool, args, output));
}

function modifyOk(): TurnReceipt {
  return collectReceipt("modify_plugin", { id: "bitcoin-pricing-view" }, { ok: true, version: "2.0.0" });
}

describe("completion levels", () => {
  it("write ok means updated — nothing more", () => {
    const s = summarizeCompletion([modifyOk()]);
    expect(s.updated).toBe(true);
    expect(s.mounted).toBe(false);
    expect(s.verified).toBe(false);
    expect(s.failed).toEqual([]);
  });

  it("open ok means mounted (dispatched, not rendered)", () => {
    const s = summarizeCompletion([
      modifyOk(),
      collectReceipt("open_tab", { id: "bitcoin-pricing-view" }, { ok: true }),
    ]);
    expect(s.updated).toBe(true);
    expect(s.mounted).toBe(true);
    expect(s.verified).toBe(false);
  });

  it("healthy read-back means verified", () => {
    const s = summarizeCompletion([
      modifyOk(),
      collectReceipt("open_tab", { id: "bitcoin-pricing-view" }, { ok: true }),
      collectReceipt("inspect_experience", { id: "bitcoin-pricing-view" }, healthyInspect()),
    ]);
    expect(s).toMatchObject({ updated: true, mounted: true, verified: true, failed: [] });
  });

  it("unhealthy inspect is not verification", () => {
    const s = summarizeCompletion([
      modifyOk(),
      collectReceipt(
        "inspect_experience",
        { id: "bitcoin-pricing-view" },
        { ok: true, data: { experience: { isHealthy: false, verification: { ok: false } } } }
      ),
    ]);
    expect(s.verified).toBe(false);
  });

  it("error receipts name the failed tool", () => {
    const s = summarizeCompletion([
      modifyOk(),
      collectReceipt("open_tab", { id: "bitcoin-pricing-view" }, { ok: false, error: "mount timeout" }),
    ]);
    expect(s.failed).toEqual(["open_tab"]);
  });
});

describe("ready/load/visual claims require evidence", () => {
  it("the reported live failure: 'ready' + 'is live' on a write-only turn is flagged", () => {
    const out = verifyReceipts(
      "Redesign applied and ready — Bitcoin is live.",
      PROMPT,
      receiptsOf([["modify_plugin", { id: "bitcoin-pricing-view" }, { ok: true, version: "2.0.0" }]])
    );
    expect(out.ok).toBe(false);
    expect(out.issues.length).toBeGreaterThan(0);
    expect(out.issues.some((i) => /ready|read-back|live/i.test(i.reason))).toBe(true);
  });

  it("the same words with open + healthy read-back pass", () => {
    const out = verifyReceipts(
      "Redesign applied and ready — Bitcoin is live.",
      PROMPT,
      receiptsOf([
        ["modify_plugin", { id: "bitcoin-pricing-view" }, { ok: true, version: "2.0.0" }],
        ["open_tab", { id: "bitcoin-pricing-view" }, { ok: true }],
        ["inspect_experience", { id: "bitcoin-pricing-view" }, healthyInspect()],
      ])
    );
    expect(out.ok).toBe(true);
  });

  it("visual verification is never claimable, even with full evidence", () => {
    const full = receiptsOf([
      ["modify_plugin", { id: "bitcoin-pricing-view" }, { ok: true, version: "2.0.0" }],
      ["open_tab", { id: "bitcoin-pricing-view" }, { ok: true }],
      ["inspect_experience", { id: "bitcoin-pricing-view" }, healthyInspect()],
    ]);
    const out = verifyReceipts(
      "Redesign applied and visually verified — renders correctly.",
      PROMPT,
      full
    );
    expect(out.ok).toBe(false);
    expect(out.issues.some((i) => i.reason.includes("visual"))).toBe(true);
  });

  it("claiming completion over a recorded failure is flagged", () => {
    const out = verifyReceipts(
      "Fixed and is ready.",
      PROMPT,
      receiptsOf([
        ["modify_plugin", { id: "bitcoin-pricing-view" }, { ok: true, version: "2.0.0" }],
        ["open_tab", { id: "bitcoin-pricing-view" }, { ok: false, error: "mount timeout" }],
      ])
    );
    expect(out.ok).toBe(false);
    expect(out.issues.some((i) => i.reason.includes("failure"))).toBe(true);
  });

  it("honest failure language passes: applied but not loaded, fixing next", () => {
    const out = verifyReceipts(
      "The redesign was applied, but the plugin failed to load. I'm fixing the startup issue and will check that it opens successfully before calling it ready.",
      PROMPT,
      receiptsOf([
        ["modify_plugin", { id: "bitcoin-pricing-view" }, { ok: true, version: "2.0.0" }],
        ["open_tab", { id: "bitcoin-pricing-view" }, { ok: false, error: "mount timeout" }],
      ])
    );
    expect(out.ok).toBe(true);
  });

  it("hedged readiness ('not ready yet') is not a claim", () => {
    const out = verifyReceipts(
      "Not ready yet — checking the mount.",
      PROMPT,
      receiptsOf([["modify_plugin", { id: "bitcoin-pricing-view" }, { ok: true }]])
    );
    expect(out.ok).toBe(true);
  });

  it("R13b still reports exactly install + approval (no new-tier noise)", () => {
    const tools = [
      "inspect_experience", "dock_search", "find_capabilities", "list_tabs",
      "enter_city", "open_tab", "inspect_tab", "get_city_context",
    ];
    const receipts = tools.map((t) => collectReceipt(t, {}, { ok: true, data: {} }));
    const out = verifyReceipts(
      `Done. Pomodoro Focus is now installed and opened in your dock.

You approved this install, so no policy conflict. I won't install anything else without asking first.`,
      "Install the pomodoro-focus plugin into audit-ws2.",
      receipts
    );
    expect(out.ok).toBe(false);
    const reasons = out.issues.map((i) => i.reason).join(" | ");
    expect(reasons).toContain("install");
    expect(reasons).toContain("approval");
    expect(reasons).not.toContain("visual");
    expect(reasons).not.toContain("read-back");
    expect(reasons).not.toContain("ready");
  });
});

describe("completion levels end to end (scripted model)", () => {
  function fakeTool(name: string, calls: string[]): AgentTool {
    return {
      name,
      description: `test double for ${name}`,
      schema: z.object({}).passthrough(),
      execute: async (args: any) => {
        calls.push(name);
        if (name === "inspect_experience") {
          return {
            success: true,
            experience: { id: args.id, isHealthy: true, verification: { ok: true } },
          };
        }
        if (name === "modify_plugin") {
          return { success: true, pluginId: args.id, version: "2.0.0" };
        }
        return { success: true, action: name };
      },
    };
  }

  async function runScenario(finalContent: string, withVerify: boolean) {
    const calls: string[] = [];
    const tools = ["modify_plugin", "open_tab", "inspect_experience"].map((n) => fakeTool(n, calls));
    let finishPayload: any = null;
    const scripted = (content: string | null, toolCalls?: string[]) => ({
      chat: {
        completions: {
          create: async () =>
            toolCalls
              ? {
                  choices: [
                    {
                      message: {
                        role: "assistant",
                        tool_calls: toolCalls.map((t, i) => ({
                          id: `c${i}`,
                          type: "function",
                          function: { name: t, arguments: JSON.stringify({ id: "bitcoin-pricing-view" }) },
                        })),
                      },
                    },
                  ],
                }
              : { choices: [{ message: { role: "assistant", content } }] },
          },
        }
      });
    // Scripted model: inspect, optionally open + verify, then conclude.
    let n = 0;
    const llm: any = {
      chat: {
        completions: {
          create: async () => {
            n++;
            if (n === 1) return scripted(null, ["modify_plugin"]).chat.completions.create();
            if (withVerify && n <= 3)
              return scripted(null, [n === 2 ? "open_tab" : "inspect_experience"]).chat.completions.create();
            return scripted(finalContent).chat.completions.create();
          },
        },
      },
    };
    const result = await runAgentLoop({
      prompt: PROMPT,
      tools,
      llmClient: llm,
      onEvent: async (e: any) => {
        if (e.type === "agent.finish") finishPayload = e.payload;
      },
    });
    return { result, finishPayload, calls };
  }

  it("premature 'ready' after write-only gets the natural hedge, not mechanics", async () => {
    const { result, finishPayload } = await runScenario(
      "Redesign applied and ready — Bitcoin is live.",
      false
    );
    expect(finishPayload?.receiptCheck?.ok).toBe(false);
    expect(result.text).toContain("couldn't confirm");
    expect(result.text).not.toContain("Receipt check");
    expect(result.text).not.toContain("ok:true");
  });

  it("verified 'ready' after open + healthy read-back passes clean", async () => {
    const { result, finishPayload, calls } = await runScenario(
      "Redesign applied and ready — Bitcoin is live in your dock.",
      true
    );
    expect(calls).toEqual(["modify_plugin", "open_tab", "inspect_experience"]);
    expect(finishPayload?.receiptCheck?.ok).toBe(true);
    expect(result.text).not.toContain("couldn't confirm");
  });
});
