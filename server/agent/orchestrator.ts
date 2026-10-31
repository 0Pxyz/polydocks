import { runAgentLoop, type AgentStepEvent, type AgentLoopOptions } from "./loop";
import { getClientForRole, roleReasoningEffort } from "./modelRegistry";
import {
  dockOpen,
  dockClose,
  dockPin,
  dockUnpin,
  dockList,
  dockFocus,
  dockNext,
  dockPrev,
  dockBackground,
  chatToggle,
} from "./tools/verbs/dock";
import { escalate } from "./tools/verbs/escalate";
import type { AgentTool } from "./tools/types";

/**
 * Orchestrator surface (#211): plain function tools ONLY — dock verbs
 * plus escalate. No tool search, no build tools, no discovery roots.
 * Anything outside this list escalates by construction (the model
 * cannot call what it is not offered).
 */
export const ORCHESTRATOR_TOOLS: AgentTool[] = [
  dockOpen,
  dockClose,
  dockPin,
  dockUnpin,
  dockList,
  dockFocus,
  dockNext,
  dockPrev,
  dockBackground,
  chatToggle,
  escalate,
];

/**
 * Escalation contract (#212): the handoff from the orchestrator loop
 * (#211) to the heavy agent. One payload in, one structured result out;
 * the heavy agent never talks to the user directly — its SSE events flow
 * back through the caller's onEvent so the orchestrator relays status
 * and the final answer. Policy and receipts apply inside the heavy loop
 * exactly as on any other turn (manifest gate, install policy, bus
 * policy, receipt check).
 */
export interface EscalationHandoff {
  /** What the heavy agent must do (full user-visible request). */
  prompt: string;
  /** Classified intent, when the orchestrator already knows it. */
  intent?: string;
  /** Opaque context id; the core never interprets it. */
  contextId?: string;
  /** Workspace the heavy agent acts in. */
  workspaceId?: string;
  /** Compressed history the orchestrator carries over (optional). */
  historySummary?: string;
  /** Bounds the heavy turn must respect. */
  constraints?: {
    maxSteps?: number;
  };
}

export interface EscalationResult {
  ok: boolean;
  text: string;
  steps: number;
  citations: Array<{ url: string; title: string }>;
  error?: string;
}

export interface HeavyRunnerOptions {
  llmClient?: any;
  modelId?: string;
  onEvent?: (event: AgentStepEvent) => void | Promise<void>;
  agentManifest?: import("../plugins/manifest").PluginManifest;
}

/** Injectable runner so the escalate tool is testable without a live key. */
let heavyRunner: typeof escalateToHeavyAgent = escalateToHeavyAgent;

export function setHeavyRunnerForTest(fn?: typeof escalateToHeavyAgent): void {
  heavyRunner = fn ?? escalateToHeavyAgent;
}

export function getHeavyRunner(): typeof escalateToHeavyAgent {
  return heavyRunner;
}

export interface OrchestratorOptions {
  prompt: string;
  workspaceId?: string;
  history?: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  /** Injectable fast-model client (tests); production resolves the orchestrator role. */
  llmClient?: AgentLoopOptions["llmClient"];
  modelId?: string;
  onEvent?: AgentLoopOptions["onEvent"];
  maxSteps?: number;
}

/**
 * Orchestrator loop (#211): the shared agent loop restricted to the
 * orchestrator surface on the small fast model with low reasoning
 * effort. Quick dock requests resolve directly without touching the
 * heavy agent; everything else escalates through the contract (#212).
 * Escalation cannot be forced by the API (tool_choice is auto-only) —
 * it is enforced by the tool description, the orchestrator prompt, and
 * the missed-escalation build gate.
 */
export async function runOrchestratorLoop(options: OrchestratorOptions) {
  const resolved = options.llmClient
    ? { llmClient: options.llmClient, ...(options.modelId ? { modelId: options.modelId } : {}) }
    : (() => {
        const { client, modelId } = getClientForRole("orchestrator");
        return { llmClient: client as any, modelId: options.modelId ?? modelId };
      })();
  const { getPrompt } = await import("./prompts/index");
  let systemPrompt: string | undefined;
  try {
    systemPrompt = getPrompt("orchestrator").text;
  } catch {
    systemPrompt = undefined;
  }
  return runAgentLoop({
    prompt: options.prompt,
    workspaceId: options.workspaceId,
    history: options.history,
    tools: ORCHESTRATOR_TOOLS,
    ...resolved,
    reasoningEffort: roleReasoningEffort("orchestrator"),
    ...(systemPrompt ? { systemPrompt } : {}),
    onEvent: options.onEvent ?? (() => {}),
    ...(typeof options.maxSteps === "number" ? { maxSteps: options.maxSteps } : {}),
  });
}

/**
 * Run the heavy agent for one escalated turn. Injectable client for
 * tests; production resolves the agent role (model + effort) here so
 * the orchestrator never hardcodes model ids.
 */
export async function escalateToHeavyAgent(
  handoff: EscalationHandoff,
  options: HeavyRunnerOptions = {}
): Promise<EscalationResult> {
  const history = handoff.historySummary
    ? [{ role: "system" as const, content: `Prior conversation summary:\n${handoff.historySummary}` }]
    : [];
  // The heavy agent never talks to the user directly: its events flow
  // through the caller's handler (the orchestrator relays), and its
  // citations are harvested from the finish payload into the result.
  let citations: Array<{ url: string; title: string }> = [];
  const relay = async (event: AgentStepEvent) => {
    if (event.type === "agent.finish" && Array.isArray((event.payload as any)?.citations)) {
      citations = (event.payload as any).citations;
    }
    await options.onEvent?.(event);
  };
  const heavy = options.llmClient
    ? { llmClient: options.llmClient, ...(options.modelId ? { modelId: options.modelId } : {}) }
    : (() => {
        const resolved = getClientForRole("agent");
        return { llmClient: resolved.client, modelId: options.modelId ?? resolved.modelId };
      })();
  const result = await runAgentLoop({
    prompt: handoff.prompt,
    workspaceId: handoff.workspaceId,
    history,
    ...heavy,
    reasoningEffort: roleReasoningEffort("agent"),
    ...(typeof handoff.constraints?.maxSteps === "number"
      ? { maxSteps: handoff.constraints.maxSteps }
      : {}),
    ...(options.agentManifest ? { agentManifest: options.agentManifest } : {}),
    onEvent: relay,
  });
  if (result.status === "completed") {
    return { ok: true, text: result.text ?? "", steps: result.steps, citations };
  }
  return {
    ok: false,
    text: result.text ?? "",
    steps: result.steps,
    citations,
    error: result.error ?? `heavy agent stopped: ${result.status}`,
  };
}
