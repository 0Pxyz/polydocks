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
import { matchDeterministicCommand, runDeterministicCommand } from "./dispatcher";
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
  /** Heavy-turn measured cost, harvested from its finish payload (for #214 metrics). */
  heavyInputTokens: number;
  heavyOutputTokens: number;
  error?: string;
}

export interface HeavyRunnerOptions {
  llmClient?: any;
  modelId?: string;
  onEvent?: (event: AgentStepEvent) => void | Promise<void>;
  agentManifest?: import("../plugins/manifest").PluginManifest;
}

/**
 * Routing policy (#213): when a heavy turn returns control to the
 * orchestrator, and why. Enforced where noted; documented here so the
 * thresholds have one home and the tests pin them.
 *
 * - Tool error: zod validation retries twice, then the tool fails for
 *   the turn (loop.ts). A failing heavy turn returns ok:false with the
 *   error text — the orchestrator relays the failure, never retries
 *   the same handoff blindly.
 * - No progress: the same tool with identical arguments is refused as
 *   a duplicate; three consecutive refusals end the turn gracefully
 *   with a stuck message (loop.ts). The stuck text returns ok:true —
 *   it names the next action, which the orchestrator can relay or
 *   re-scope, instead of burning more steps.
 * - Step bound: constraints.maxSteps caps the heavy turn; the fallback
 *   synthesis still produces a partial answer, which returns ok:true
 *   with steps (partial beats nothing).
 * - Timeout/cancel: aborts propagate as errors and return ok:false.
 * - Low confidence: the receipt check appends a verify-before-relying
 *   note inside the heavy text; the result still returns ok:true.
 */
export const ROUTING_POLICY = {
  validationRetries: 2,
  duplicateRefusalsToStuck: 3,
  errorReturnsControl: true,
  stuckReturnsControl: true,
} as const;

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
  /** Tool surface override (eval doubles); defaults to ORCHESTRATOR_TOOLS. */
  tools?: AgentTool[];
  onEvent?: AgentLoopOptions["onEvent"];
  maxSteps?: number;
  /** Agent manifest override for the permission gate (#207). */
  agentManifest?: import("../plugins/manifest").PluginManifest;
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
  // Fast dispatcher first (#178): imperative dock/theme commands resolve
  // with zero model calls. A denied or failed deterministic run falls
  // through to the model loop — never fail the turn on the fast path.
  const emit = options.onEvent ?? (() => {});
  const fast = matchDeterministicCommand(options.prompt);
  if (fast) {
    const ran = await runDeterministicCommand(fast, {
      workspaceId: options.workspaceId,
      agentManifest: options.agentManifest,
    });
    if (ran.ok) {
      await emit({ step: 1, type: "tool.start", payload: { name: ran.toolName, deterministic: true, reason: fast.reason } });
      await emit({ step: 1, type: "tool.done", payload: { name: ran.toolName, deterministic: true } });
      await emit({ step: 1, type: "agent.finish", payload: { text: ran.text, deterministic: true } });
      return { status: "completed" as const, text: ran.text, steps: 1 };
    }
  }
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
    tools: options.tools ?? ORCHESTRATOR_TOOLS,
    ...resolved,
    reasoningEffort: roleReasoningEffort("orchestrator"),
    ...(systemPrompt ? { systemPrompt } : {}),
    onEvent: options.onEvent ?? (() => {}),
    ...(typeof options.maxSteps === "number" ? { maxSteps: options.maxSteps } : {}),
    ...(options.agentManifest ? { agentManifest: options.agentManifest } : {}),
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
  let heavyInputTokens = 0;
  let heavyOutputTokens = 0;
  const relay = async (event: AgentStepEvent) => {
    if (event.type === "agent.finish") {
      if (Array.isArray((event.payload as any)?.citations)) {
        citations = (event.payload as any).citations;
      }
      heavyInputTokens = Number((event.payload as any)?.inputTokens ?? heavyInputTokens) || heavyInputTokens;
      heavyOutputTokens = Number((event.payload as any)?.outputTokens ?? heavyOutputTokens) || heavyOutputTokens;
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
    return { ok: true, text: result.text ?? "", steps: result.steps, citations, heavyInputTokens, heavyOutputTokens };
  }
  if (result.status === "max_steps_reached" && (result.text ?? "").trim()) {
    // Partial synthesis still answers: return control with the text.
    return { ok: true, text: result.text ?? "", steps: result.steps, citations, heavyInputTokens, heavyOutputTokens };
  }
  return {
    ok: false,
    text: result.text ?? "",
    steps: result.steps,
    citations,
    heavyInputTokens,
    heavyOutputTokens,
    error: result.error ?? `heavy agent stopped: ${result.status}`,
  };
}
