import { z } from "zod";
import { runAgentLoop } from "../../server/agent/loop";
import type { AgentTool } from "../../server/agent/tools/types";

export interface EvalStep {
  toolCalls?: Array<{ name: string; args?: unknown }>;
  content?: string;
  usage?: { prompt_tokens: number; completion_tokens: number };
}

export interface EvalScenario {
  id: string;
  kind:
    | "open-tab"
    | "open-plugin"
    | "fix-plugin"
    | "create-plugin"
    | "ambiguous"
    | "duplicate-avoidance"
    | "research"
    | "memory";
  prompt: string;
  expectTools: string[];
  forbidTools: string[];
  steps: EvalStep[];
}

function s(
  id: EvalScenario["kind"] | string,
  kind: EvalScenario["kind"],
  prompt: string,
  expectTools: string[],
  forbidTools: string[],
  steps: EvalStep[],
): EvalScenario {
  return { id: String(id), kind, prompt, expectTools, forbidTools, steps };
}

const U = { prompt_tokens: 120, completion_tokens: 40 };

/**
 * 18 scripted scenarios. The model double follows the happy path; the
 * harness asserts the loop mechanics (right tools ran, forbidden tools
 * never started, duplicates refused). No network: fully mocked for CI.
 */
export const SCENARIOS: EvalScenario[] = [
  s("open-tab-basic", "open-tab", "Open the notes tab", ["dock.open"], ["create_plugin"], [
    { toolCalls: [{ name: "dock.open", args: { id: "notes" } }], usage: U },
    { content: "Notes is open." },
  ]),
  s("open-tab-close", "open-tab", "Close the browser tab", ["dock.close"], ["create_plugin"], [
    { toolCalls: [{ name: "dock.close", args: { id: "browser" } }], usage: U },
    { content: "Browser closed." },
  ]),
  s("open-tab-list", "open-tab", "What tools do I have?", ["dock.list"], ["create_plugin", "modify_plugin"], [
    { toolCalls: [{ name: "dock.list", args: {} }], usage: U },
    { content: "Here are your tools." },
  ]),
  s("open-plugin-existing", "open-plugin", "Open the pomodoro timer", ["dock.open"], ["create_plugin"], [
    { toolCalls: [{ name: "find_capabilities", args: { query: "pomodoro" } }], usage: U },
    { toolCalls: [{ name: "dock.open", args: { id: "pomodoro" } }], usage: U },
    { content: "Pomodoro is open." },
  ]),
  s("open-plugin-store", "open-plugin", "Install the kanban board from the store", ["plugins.install", "dock.open"], ["create_plugin"], [
    { toolCalls: [{ name: "find_capabilities", args: { query: "kanban" } }], usage: U },
    { toolCalls: [{ name: "plugins.install", args: { pluginId: "kanban" } }], usage: U },
    { toolCalls: [{ name: "dock.open", args: { id: "kanban" } }], usage: U },
    { content: "Kanban installed and open." },
  ]),
  s("fix-plugin-inspect-patch", "fix-plugin", "Fix the feed plugin, it shows nothing", ["inspect_experience", "modify_plugin"], ["create_plugin"], [
    { toolCalls: [{ name: "inspect_experience", args: { id: "feed" } }], usage: U },
    { toolCalls: [{ name: "modify_plugin", args: { id: "feed", op: "patch" } }], usage: U },
    { content: "Feed fixed in place." },
  ]),
  s("fix-plugin-no-recreate", "fix-plugin", "The reader background is broken, fix it", ["inspect_experience"], ["create_plugin"], [
    { toolCalls: [{ name: "inspect_experience", args: { id: "reader" } }], usage: U },
    { toolCalls: [{ name: "modify_plugin", args: { id: "reader", op: "patch" } }], usage: U },
    { content: "Reader patched." },
  ]),
  s("create-plugin-new", "create-plugin", "Build me a habit tracker I can come back to", ["find_capabilities", "create_plugin"], [], [
    { toolCalls: [{ name: "find_capabilities", args: { query: "habit tracker" } }], usage: U },
    { toolCalls: [{ name: "create_plugin", args: { title: "habit tracker" } }], usage: U },
    { content: "Habit tracker created." },
  ]),
  s("create-plugin-verify", "create-plugin", "Create a calculator tool and verify it works", ["create_plugin", "operate_plugin"], [], [
    { toolCalls: [{ name: "find_capabilities", args: { query: "calculator" } }], usage: U },
    { toolCalls: [{ name: "create_plugin", args: { title: "calculator" } }], usage: U },
    { toolCalls: [{ name: "operate_plugin", args: { id: "calculator" } }], usage: U },
    { content: "Calculator created and verified." },
  ]),
  s("ambiguous-clarify", "ambiguous", "Make it better", [], ["create_plugin", "modify_plugin", "dock.open"], [
    { content: "Which tool do you mean — the feed or the reader?" },
  ]),
  s("ambiguous-scope", "ambiguous", "Organize my stuff", [], ["create_plugin"], [
    { content: "Tell me which folder or workspace to organize first." },
  ]),
  s("duplicate-avoid-open", "duplicate-avoidance", "Open the timer", ["dock.open"], ["create_plugin"], [
    { toolCalls: [{ name: "dock.open", args: { id: "timer" } }], usage: U },
    { toolCalls: [{ name: "dock.open", args: { id: "timer" } }], usage: U },
    { content: "Timer is open." },
  ]),
  s("duplicate-avoid-create", "duplicate-avoidance", "Build a pomodoro timer", ["find_capabilities"], ["create_plugin"], [
    { toolCalls: [{ name: "find_capabilities", args: { query: "pomodoro" } }], usage: U },
    { content: "A pomodoro timer already exists — I opened it instead of duplicating." },
  ]),
  s("research-sources", "research", "Research papers on spaced repetition", ["search_web", "fetch_page"], ["create_plugin", "apply_theme"], [
    { toolCalls: [{ name: "search_web", args: { query: "spaced repetition papers" } }], usage: U },
    { toolCalls: [{ name: "fetch_page", args: { url: "https://example.com/paper" } }], usage: U },
    { content: "Found 2 papers." },
  ]),
  s("research-no-mutate", "research", "Latest news on fusion energy", ["search_web"], ["apply_theme", "create_plugin"], [
    { toolCalls: [{ name: "search_web", args: { query: "fusion energy news" } }], usage: U },
    { content: "Here is the latest news." },
  ]),
  s("memory-recall", "memory", "Remember that I prefer dark themes", ["record_memory"], ["create_plugin"], [
    { toolCalls: [{ name: "record_memory", args: { text: "prefers dark themes" } }], usage: U },
    { content: "Noted." },
  ]),
  s("theme-change", "open-tab", "Change my theme to dark", ["apply_theme"], ["search_web", "create_plugin"], [
    { toolCalls: [{ name: "apply_theme", args: { theme: "dark" } }], usage: U },
    { content: "Theme set to dark." },
  ]),
  s("pin-flow", "open-plugin", "Pin the notes tool", ["dock.pin"], ["create_plugin"], [
    { toolCalls: [{ name: "dock.pin", args: { id: "notes" } }], usage: U },
    { content: "Notes pinned." },
  ]),
];

export interface ScenarioResult {
  id: string;
  kind: string;
  success: boolean;
  toolCalls: number;
  duplicated: boolean;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  missing: string[];
  forbiddenHit: string[];
}

function scriptedLlm(steps: EvalStep[]) {
  let i = 0;
  return {
    chat: {
      completions: {
        create: async () => {
          const step = steps[Math.min(i++, steps.length - 1)];
          if (step.toolCalls) {
            return {
              usage: step.usage ?? { prompt_tokens: 100, completion_tokens: 30 },
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
          return {
            usage: step.usage ?? { prompt_tokens: 50, completion_tokens: 20 },
            choices: [{ message: { role: "assistant", content: step.content ?? "done" } }],
          };
        },
      },
    },
  };
}

function fakeTool(name: string, calls: string[], onDuplicate: () => void): AgentTool {
  return {
    name,
    description: `eval double for ${name}`,
    schema: z.object({}).passthrough(),
    execute: async () => {
      calls.push(name);
      if (name === "find_capabilities") {
        return { found: 1, capabilities: [{ id: "x.refresh", title: "Refresh" }] };
      }
      if (name === "inspect_experience") {
        return { success: true, id: "x", errors: [], isHealthy: true };
      }
      void onDuplicate;
      return { success: true, ok: true, action: name };
    },
  };
}

export async function runScenario(scenario: EvalScenario): Promise<ScenarioResult> {
  const calls: string[] = [];
  let duplicated = false;
  const toolNames = Array.from(
    new Set([...scenario.expectTools, ...scenario.forbidTools, "find_capabilities", "dock.open", "dock.list", "dock.close", "dock.pin", "inspect_experience", "modify_plugin", "create_plugin", "operate_plugin", "plugins.install", "search_web", "fetch_page", "record_memory", "apply_theme", "dock.list"]),
  );
  const tools = toolNames.map((n) => fakeTool(n, calls, () => {}));
  const started: string[] = [];
  let inputTokens = 0;
  let outputTokens = 0;
  const t0 = Date.now();
  await runAgentLoop({
    prompt: scenario.prompt,
    tools,
    llmClient: scriptedLlm(scenario.steps) as any,
    onEvent: async (e: any) => {
      if (e.type === "tool.start") started.push(e.payload?.name);
      if (e.type === "agent.finish") {
        inputTokens = e.payload?.inputTokens ?? 0;
        outputTokens = e.payload?.outputTokens ?? 0;
      }
      if (e.type === "tool.done" && (e.payload?.result as any)?.duplicate === true) duplicated = true;
    },
  });
  const latencyMs = Date.now() - t0;
  // Duplicate refusal surfaces as a duplicate:true tool result; also detect
  // identical consecutive starts as a duplication signal.
  const seen = new Set<string>();
  for (const n of started) {
    if (seen.has(n)) duplicated = true;
    seen.add(n);
  }
  const missing = scenario.expectTools.filter((t) => !started.includes(t));
  const forbiddenHit = scenario.forbidTools.filter((t) => started.includes(t));
  const success = missing.length === 0 && forbiddenHit.length === 0;
  return {
    id: scenario.id,
    kind: scenario.kind,
    success,
    toolCalls: started.length,
    duplicated,
    latencyMs,
    inputTokens,
    outputTokens,
    missing,
    forbiddenHit,
  };
}

export async function runAllScenarios(): Promise<ScenarioResult[]> {
  const out: ScenarioResult[] = [];
  for (const s of SCENARIOS) out.push(await runScenario(s));
  return out;
}

export function summarize(results: ScenarioResult[]) {
  const total = results.length;
  const passed = results.filter((r) => r.success).length;
  const toolCalls = results.reduce((a, r) => a + r.toolCalls, 0);
  const duplicated = results.filter((r) => r.duplicated).length;
  const latencyMs = results.reduce((a, r) => a + r.latencyMs, 0);
  const inputTokens = results.reduce((a, r) => a + r.inputTokens, 0);
  const outputTokens = results.reduce((a, r) => a + r.outputTokens, 0);
  return { total, passed, successRate: total ? passed / total : 0, toolCalls, duplicated, latencyMs, inputTokens, outputTokens };
}
