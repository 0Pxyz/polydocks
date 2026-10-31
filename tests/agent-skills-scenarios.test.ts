import { describe, expect, it } from "bun:test";
import { z } from "zod";
import { runAgentLoop } from "../server/agent/loop";
import type { AgentTool } from "../server/agent/tools/types";

/**
 * Agent evaluation scenarios: scripted-model runs asserting TOOL SELECTION,
 * not prose. The model double follows the skill protocol; the assertions
 * pin the loop mechanics (right tool runs, wrong tools never start,
 * duplicates are refused). Live-model variants run only with
 * POLYMAX_LIVE_MODEL=1 and a configured MODEL_API_KEY.
 */

function fakeTool(name: string, calls: string[]): AgentTool {
  return {
    name,
    description: `test double for ${name}`,
    schema: z.object({}).passthrough(),
    execute: async () => {
      calls.push(name);
      if (name === "find_capabilities") {
        return { query: "feed", found: 1, capabilities: [{ id: "gtm-app-feed.refresh", title: "Refresh feed" }] };
      }
      if (name === "inspect_experience") {
        return { success: true, id: "gtm-app-feed", errors: [], isHealthy: true };
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

async function runScenario(prompt: string, toolNames: string[], steps: Parameters<typeof scriptedLlm>[0], extra: Record<string, unknown> = {}) {
  const calls: string[] = [];
  const tools = toolNames.map((n) => fakeTool(n, calls));
  const started: string[] = [];
  await runAgentLoop({
    prompt,
    tools,
    llmClient: scriptedLlm(steps) as any,
    onEvent: async (e: any) => {
      if (e.type === "tool.start") started.push(e.payload?.name);
    },
    ...extra,
  });
  return { calls, started };
}

describe("Agent evaluation scenarios (scripted model, tool selection)", () => {
  it("'create the GTM feed' with gtm-app-feed present inspects and patches, never recreates", async () => {
    const { calls, started } = await runScenario(
      "create the GTM feed",
      ["find_capabilities", "inspect_experience", "modify_plugin", "create_tab", "create_plugin"],
      [
        { toolCalls: [{ name: "find_capabilities", args: { query: "feed" } }] },
        { toolCalls: [{ name: "inspect_experience", args: { id: "gtm-app-feed" } }] },
        { toolCalls: [{ name: "modify_plugin", args: { id: "gtm-app-feed", code: "x".repeat(11), changeSummary: "refresh" } }] },
        { content: "Feed refreshed in place." },
      ]
    );
    expect(started).toEqual(["find_capabilities", "inspect_experience", "modify_plugin"]);
    expect(calls).not.toContain("create_tab");
    expect(calls).not.toContain("create_plugin");
  });

  it("'close the flashcards tab' closes, never deletes", async () => {
    const { calls, started } = await runScenario(
      "close the flashcards tab",
      ["close_tray", "delete_tab"],
      [{ toolCalls: [{ name: "close_tray", args: {} }] }, { content: "Tray closed." }]
    );
    expect(started).toEqual(["close_tray"]);
    expect(calls).not.toContain("delete_tab");
  });

  it("'what tabs do I have' lists only", async () => {
    const { calls, started } = await runScenario(
      "what tabs do I have",
      ["list_tabs", "inspect_tab", "get_city_context"],
      [{ toolCalls: [{ name: "list_tabs", args: {} }] }, { content: "Here are your tabs." }]
    );
    expect(started).toEqual(["list_tabs"]);
    expect(calls).not.toContain("inspect_tab");
    expect(calls).not.toContain("get_city_context");
  });

  it("theme request with image calls no tools on this backend (no apply_theme tool on main)", async () => {
    const started: string[] = [];
    await runAgentLoop({
      prompt: "add this background to my theme",
      attachments: [{ id: "att-1", name: "bg.png", type: "image/png", size: 10, dataUrl: "data:image/png;base64,x", isImage: true }],
      tools: [fakeTool("search_web", []), fakeTool("create_tab", [])],
      llmClient: scriptedLlm([{ content: "I cannot apply theme images on this backend yet." }]) as any,
      onEvent: async (e: any) => {
        if (e.type === "tool.start") started.push(e.payload?.name);
      },
    });
    // No research, no writes, no synthesis for a theme ask.
    expect(started).toEqual([]);
  });

  it("research request searches and fetches, never synthesizes", async () => {
    const { calls, started } = await runScenario(
      "find articles about go to market",
      ["search_web", "fetch_page", "create_tab", "create_plugin", "build_city"],
      [
        { toolCalls: [{ name: "search_web", args: { query: "go to market" } }] },
        { toolCalls: [{ name: "fetch_page", args: { urls: ["https://example.com/a"] } }] },
        { content: "Here is what I found." },
      ]
    );
    expect(started).toEqual(["search_web", "fetch_page"]);
    expect(calls).not.toContain("create_tab");
    expect(calls).not.toContain("create_plugin");
    expect(calls).not.toContain("build_city");
  });

  it("same tool call with same args twice in one turn runs once", async () => {
    const calls: string[] = [];
    const tools = [fakeTool("list_tabs", calls)];
    const results: any[] = [];
    await runAgentLoop({
      prompt: "what tabs do I have",
      tools,
      llmClient: scriptedLlm([
        { toolCalls: [{ name: "list_tabs", args: {} }, { name: "list_tabs", args: {} }] },
        { content: "Listed once." },
      ]) as any,
      onEvent: async (e: any) => {
        if (e.type === "tool.done") results.push(e.payload?.result);
      },
    });
    expect(calls).toEqual(["list_tabs"]);
    expect(results.length).toBe(2);
    expect(results[1]?.duplicate).toBe(true);
  });
});

describe("Live-model scenarios (gated)", () => {
  const live = process.env.POLYMAX_LIVE_MODEL === "1";
  it.skipIf(!live)("research request uses search tools, not synthesis", async () => {
    const started: string[] = [];
    await runAgentLoop({
      prompt: "find articles about go to market",
      onEvent: async (e: any) => {
        if (e.type === "tool.start") started.push(e.payload?.name);
      },
    });
    expect(started).toContain("search_web");
    expect(started).not.toContain("create_tab");
    expect(started).not.toContain("create_plugin");
  });
});
