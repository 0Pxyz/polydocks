import { dockOpen, dockClose, dockList } from "./tools/verbs/dock";
import { apply_theme } from "./tools/apply_theme";
import { checkAgentPermission } from "./manifest";
import type { PluginManifest } from "../plugins/manifest";

/**
 * Fast deterministic dispatcher (#178 slice 1).
 *
 * Imperative dock/theme commands resolve WITHOUT any model call: the match
 * is a pure function of the prompt text, the tool executes directly, and
 * the turn returns `completed` with `steps: 1`. Everything else returns
 * null so the caller falls through to the LLM orchestrator loop — a missed
 * match costs one regex, never a wrong action. Interrogative sentences
 * ("what is in my dock?") deliberately do NOT match; only imperatives do.
 */

export type DeterministicKind = "dock.open" | "dock.close" | "dock.list" | "apply_theme";

export interface DeterministicDecision {
  kind: DeterministicKind;
  /** Human-readable reason kept in the routing log. */
  reason: string;
  args: Record<string, unknown>;
}

/** Allow-listed dock ids the dispatcher may open/close. Exported so the orchestrator router resolves the same aliases. */
export const DOCK_ID_ALIASES: Record<string, string> = {
  browser: "browser",
  settings: "settings",
  store: "store",
  library: "store",
  tools: "plugins",
  plugins: "plugins",
  creations: "creations",
  agent: "agent",
  chat: "agent",
  notes: "notes",
  sources: "sources",
  files: "files",
};

const THEME_IDS = new Set(["void", "cyber", "amber", "amethyst"]);

function clean(prompt: string): string {
  return prompt.trim().toLowerCase().replace(/[.!?]+$/, "").trim();
}

/**
 * Pure classifier: imperative dock/theme commands map to a tool + args,
 * everything else is null (fallback to the model loop).
 */
export function matchDeterministicCommand(prompt: string): DeterministicDecision | null {
  const text = clean(prompt);

  let m = text.match(/^open\s+(?:the\s+)?([a-z]+)$/);
  if (m) {
    const id = DOCK_ID_ALIASES[m[1]];
    if (!id) return null;
    return { kind: "dock.open", reason: `imperative open for known dock id "${id}"`, args: { tabId: id } };
  }

  m = text.match(/^close\s+(?:the\s+)?([a-z]+)$/);
  if (m) {
    const id = DOCK_ID_ALIASES[m[1]];
    if (!id) return null;
    return { kind: "dock.close", reason: `imperative close for known dock id "${id}"`, args: { id } };
  }

  m = text.match(/^(?:list|show)(?:\s+me)?(?:\s+my)?\s+(dock|tools|tabs|plugins)$/);
  if (m) {
    return { kind: "dock.list", reason: "imperative dock inventory request", args: {} };
  }

  m = text.match(/^(?:switch|change|set)(?:\s+the)?\s+theme\s+to\s+([a-z]+)$/);
  if (m) {
    if (!THEME_IDS.has(m[1])) return null;
    return { kind: "apply_theme", reason: `imperative theme switch to "${m[1]}"`, args: { theme: m[1] } };
  }

  return null;
}

const TOOL_BY_KIND = {
  "dock.open": dockOpen,
  "dock.close": dockClose,
  "dock.list": dockList,
  apply_theme,
} as const;

export interface DeterministicRunResult {
  ok: boolean;
  text: string;
  toolName: string;
  output: unknown;
  error?: string;
}

/**
 * Executes a matched decision without a model call. The manifest gate
 * applies exactly as in the loop (#207): a denied tool returns ok:false
 * so the caller falls back to the full loop instead of failing the turn.
 */
export async function runDeterministicCommand(
  decision: DeterministicDecision,
  ctx: { workspaceId?: string; sessionId?: string; agentManifest?: PluginManifest } = {}
): Promise<DeterministicRunResult> {
  const tool: any = TOOL_BY_KIND[decision.kind];
  const gate = checkAgentPermission(tool.name, ctx.agentManifest);
  if (!gate.allowed) {
    return { ok: false, text: "", toolName: tool.name, output: null, error: gate.reason };
  }
  const parsed = tool.schema.safeParse(decision.args);
  if (!parsed.success) {
    return { ok: false, text: "", toolName: tool.name, output: null, error: "invalid deterministic args" };
  }
  try {
    const output = await tool.execute(parsed.data, {
      workspaceId: ctx.workspaceId,
      sessionId: ctx.sessionId,
      step: 1,
      actor: "agent" as const,
    });
    if (output && typeof output === "object" && (output as any).ok === false) {
      return { ok: false, text: "", toolName: tool.name, output, error: String((output as any).error ?? "tool failed") };
    }
    return { ok: true, text: confirmationText(decision, output), toolName: tool.name, output };
  } catch (err: any) {
    return { ok: false, text: "", toolName: tool.name, output: null, error: err?.message ?? "tool threw" };
  }
}

function confirmationText(decision: DeterministicDecision, output: unknown): string {
  if (decision.kind === "dock.open") return `Opened ${String((decision.args as any).tabId)}.`;
  if (decision.kind === "dock.close") return `Closed ${String((decision.args as any).id)}.`;
  if (decision.kind === "dock.list") {
    const data: any = (output as any)?.data;
    const items = Array.isArray(data?.items) ? data.items.length : Array.isArray(data) ? data.length : null;
    return items === null ? "Here is your dock." : `Here is your dock: ${items} item${items === 1 ? "" : "s"}.`;
  }
  if (decision.kind === "apply_theme") {
    const message = (output as any)?.message;
    return typeof message === "string" && message.length > 0 ? message : "Theme updated.";
  }
  return "Done.";
}
