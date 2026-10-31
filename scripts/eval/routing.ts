import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { runAgentLoop } from "../../server/agent/loop";
import { runOrchestratorLoop, setHeavyRunnerForTest, escalateToHeavyAgent } from "../../server/agent/orchestrator";
import type { AgentTool } from "../../server/agent/tools/types";

/**
 * Routing metrics harness (#214): per-role latency and cost, escalation
 * rate, unnecessary vs missed escalations, plus an orchestrator-off
 * baseline for the same prompts. Fully scripted (no network) so it runs
 * in CI; with live keys the same scenarios measure real model routing.
 *
 * Each scenario declares its expected path. The orchestrator double
 * either answers directly or emits an escalate call; the heavy runner
 * is scripted per scenario. Mismatches fail the run:
 * - escalated but expected direct  -> unnecessary escalation
 * - direct but expected escalate   -> missed escalation
 */

interface RoutingStep {
  toolCalls?: Array<{ name: string; args?: unknown }>;
  content?: string;
  usage?: { prompt_tokens: number; completion_tokens: number };
}

interface RoutingScenario {
  id: string;
  prompt: string;
  expectedPath: "direct" | "escalate";
  orchSteps: RoutingStep[];
  heavySteps?: RoutingStep[];
  heavyTools?: string[];
}

const U = { prompt_tokens: 120, completion_tokens: 40 };

const SCENARIOS: RoutingScenario[] = [
  {
    id: "route-greeting",
    prompt: "Hey",
    expectedPath: "direct",
    orchSteps: [{ content: "Hey! How can I help?", usage: { prompt_tokens: 60, completion_tokens: 10 } }],
  },
  {
    id: "route-dock-list",
    prompt: "What tools do I have?",
    expectedPath: "direct",
    orchSteps: [
      { toolCalls: [{ name: "dock.list", args: {} }], usage: U },
      { content: "Here are your tools.", usage: { prompt_tokens: 60, completion_tokens: 10 } },
    ],
  },
  {
    id: "route-dock-open",
    prompt: "Open the notes tab",
    expectedPath: "direct",
    orchSteps: [
      { toolCalls: [{ name: "dock.open", args: { id: "notes" } }], usage: U },
      { content: "Notes is open.", usage: { prompt_tokens: 60, completion_tokens: 10 } },
    ],
  },
  {
    id: "route-build",
    prompt: "Build me a habit tracker I can come back to",
    expectedPath: "escalate",
    orchSteps: [
      { toolCalls: [{ name: "escalate", args: { prompt: "Build me a habit tracker I can come back to" } }], usage: U },
      { content: "Habit tracker created.", usage: { prompt_tokens: 60, completion_tokens: 15 } },
    ],
    heavySteps: [
      { toolCalls: [{ name: "find_capabilities", args: { query: "habit tracker" } }], usage: U },
      { toolCalls: [{ name: "plugins.create", args: { id: "habit" } }], usage: U },
      { toolCalls: [{ name: "dock.open", args: { id: "habit" } }], usage: U },
      { content: "Habit tracker created.", usage: { prompt_tokens: 60, completion_tokens: 15 } },
    ],
    heavyTools: ["find_capabilities", "plugins.create", "dock.open"],
  },
  {
    id: "route-fix",
    prompt: "Fix the feed plugin, it shows nothing",
    expectedPath: "escalate",
    orchSteps: [
      { toolCalls: [{ name: "escalate", args: { prompt: "Fix the feed plugin, it shows nothing" } }], usage: U },
      { content: "Feed patched.", usage: { prompt_tokens: 60, completion_tokens: 15 } },
    ],
    heavySteps: [
      { toolCalls: [{ name: "plugins.edit", args: { pluginId: "feed" } }], usage: U },
      { content: "Feed patched.", usage: { prompt_tokens: 60, completion_tokens: 15 } },
    ],
    heavyTools: ["plugins.edit"],
  },
  {
    id: "route-install",
    prompt: "Install the kanban board from the store",
    expectedPath: "escalate",
    orchSteps: [
      { toolCalls: [{ name: "escalate", args: { prompt: "Install the kanban board from the store" } }], usage: U },
      { content: "Kanban installed.", usage: { prompt_tokens: 60, completion_tokens: 15 } },
    ],
    heavySteps: [
      { toolCalls: [{ name: "plugins.install", args: { pluginId: "kanban" } }], usage: U },
      { toolCalls: [{ name: "dock.open", args: { id: "kanban" } }], usage: U },
      { content: "Kanban installed.", usage: { prompt_tokens: 60, completion_tokens: 15 } },
    ],
    heavyTools: ["plugins.install", "dock.open"],
  },
];

function scriptedLlm(steps: RoutingStep[]) {
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

function fakeTool(name: string): AgentTool {
  return {
    name,
    description: `routing double for ${name}`,
    schema: z.object({}).passthrough(),
    execute: async () => ({ success: true, ok: true, action: name }),
  };
}

export interface RoutingResult {
  id: string;
  expectedPath: "direct" | "escalate";
  actualPath: "direct" | "escalate";
  match: boolean;
  mismatchKind: "none" | "unnecessary" | "missed";
  escalated: boolean;
  heavySteps: number;
  orchInputTokens: number;
  orchOutputTokens: number;
  heavyInputTokens: number;
  heavyOutputTokens: number;
  latencyMs: number;
}

async function runRoutingScenario(s: RoutingScenario): Promise<RoutingResult> {
  let escalated = false;
  let heavySteps = 0;
  let heavyInputTokens = 0;
  let heavyOutputTokens = 0;
  setHeavyRunnerForTest(async (handoff, options) => {
    escalated = true;
    const out = await escalateToHeavyAgent(handoff, {
      ...options,
      llmClient: scriptedLlm(s.heavySteps ?? [{ content: "Heavy done." }]) as any,
    });
    return out;
  });
  // Heavy token accounting rides the escalate tool result (the heavy
  // finish payload is harvested into it by the contract).
  let orchInputTokens = 0;
  let orchOutputTokens = 0;
  const orchTools = ["dock.list", "dock.open", "dock.close", "dock.pin", "dock.unpin", "escalate"].map(fakeTool);
  // The real escalate tool delegates to the injected runner above.
  const { escalate } = await import("../../server/agent/tools/verbs/escalate");
  const tools = [...orchTools.filter((t) => t.name !== "escalate"), escalate];
  const t0 = Date.now();
  try {
    await runOrchestratorLoop({
      prompt: s.prompt,
      tools,
      llmClient: scriptedLlm(s.orchSteps) as any,
      onEvent: async (e: any) => {
        if (e.type === "agent.finish") {
          orchInputTokens = e.payload?.inputTokens ?? 0;
          orchOutputTokens = e.payload?.outputTokens ?? 0;
        }
        if (e.type === "tool.done" && (e.payload as any)?.name === "escalate") {
          const r = (e.payload as any)?.result ?? {};
          heavySteps = Number(r.steps ?? 0);
          heavyInputTokens = Number(r.heavyInputTokens ?? 0);
          heavyOutputTokens = Number(r.heavyOutputTokens ?? 0);
        }
      },
    });
  } finally {
    setHeavyRunnerForTest();
  }
  const latencyMs = Date.now() - t0;
  const actualPath = escalated ? "escalate" : "direct";
  const match = actualPath === s.expectedPath;
  const mismatchKind = !match ? (escalated ? "unnecessary" : "missed") : ("none" as const);
  return {
    id: s.id,
    expectedPath: s.expectedPath,
    actualPath,
    match,
    mismatchKind,
    escalated,
    heavySteps,
    orchInputTokens,
    orchOutputTokens,
    heavyInputTokens,
    heavyOutputTokens,
    latencyMs,
  };
}

async function runHeavyOnly(s: RoutingScenario) {
  const tools = Array.from(new Set([...(s.heavyTools ?? []), "dock.list", "dock.open"])).map(fakeTool);
  const t0 = Date.now();
  let inputTokens = 0;
  let outputTokens = 0;
  await runAgentLoop({
    prompt: s.prompt,
    tools,
    llmClient: scriptedLlm(s.heavySteps ?? [{ content: "Heavy done." }]) as any,
    onEvent: async (e: any) => {
      if (e.type === "agent.finish") {
        inputTokens = e.payload?.inputTokens ?? 0;
        outputTokens = e.payload?.outputTokens ?? 0;
      }
    },
  });
  return { inputTokens, outputTokens, latencyMs: Date.now() - t0 };
}

async function main() {
  const outDir = path.resolve(process.cwd(), "eval-results");
  const startedAt = new Date().toISOString();
  const results: RoutingResult[] = [];
  for (const s of SCENARIOS) results.push(await runRoutingScenario(s));
  const mismatches = results.filter((r) => !r.match);
  const escalations = results.filter((r) => r.escalated);
  // Orchestrator-off baseline: same prompts straight to the heavy loop.
  const baseline: Record<string, { inputTokens: number; outputTokens: number; latencyMs: number }> = {};
  for (const s of SCENARIOS) baseline[s.id] = await runHeavyOnly(s);
  const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0);
  const routedTokens = sum(results.map((r) => r.orchInputTokens + r.orchOutputTokens + r.heavyInputTokens + r.heavyOutputTokens));
  const offTokens = sum(SCENARIOS.map((s) => baseline[s.id].inputTokens + baseline[s.id].outputTokens));
  const payload = {
    startedAt,
    summary: {
      total: results.length,
      matched: results.length - mismatches.length,
      escalationRate: escalations.length / results.length,
      unnecessary: results.filter((r) => r.mismatchKind === "unnecessary").length,
      missed: results.filter((r) => r.mismatchKind === "missed").length,
      routedTokens,
      heavyOnlyTokens: offTokens,
      latencyMs: sum(results.map((r) => r.latencyMs)),
    },
    results,
    baseline,
  };
  await fs.mkdir(outDir, { recursive: true });
  const stamp = startedAt.replace(/[:.]/g, "-");
  await fs.writeFile(path.join(outDir, `routing-${stamp}.json`), `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
  await fs.writeFile(path.join(outDir, "routing-latest.json"), `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
  const lines = [
    `# Routing report (${startedAt})`,
    ``,
    `- scenarios: ${results.length}, path match: ${results.length - mismatches.length}/${results.length}`,
    `- escalation rate: ${(escalations.length / results.length).toFixed(2)}, unnecessary: ${payload.summary.unnecessary}, missed: ${payload.summary.missed}`,
    `- tokens routed (orch+heavy): ${routedTokens}, heavy-only baseline: ${offTokens}`,
    `- latency routed: ${payload.summary.latencyMs}ms`,
    ``,
    ...results.map(
      (r) =>
        `- ${r.match ? "MATCH" : r.mismatchKind.toUpperCase()} ${r.id} expected=${r.expectedPath} actual=${r.actualPath} orch=${r.orchInputTokens}/${r.orchOutputTokens} heavy=${r.heavyInputTokens}/${r.heavyOutputTokens} heavySteps=${r.heavySteps} lat=${r.latencyMs}ms`
    ),
  ];
  await fs.writeFile(path.join(outDir, "routing-latest.md"), `${lines.join("\n")}\n`, "utf-8");
  console.log(lines.join("\n"));
  if (mismatches.length > 0) {
    console.error(`\nRouting mismatches: ${mismatches.map((m) => m.id).join(", ")}`);
    process.exit(1);
  }
}

await main();
