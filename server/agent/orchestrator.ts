import { runAgentLoop, type AgentStepEvent, type AgentLoopOptions } from "./loop";
import { matchDeterministicCommand, runDeterministicCommand } from "./dispatcher";
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
import { searchDockCatalog } from "./tools/dockCatalog";
import { TaskService } from "../services/taskService";
import { createSession, getSession, taskExecutionEngine } from "./taskRunner";
import { insertJobEvent } from "../workspace/sessions";
import { db } from "../workspace/db";

/**
 * Non-blocking orchestrator (slice 3 + 3b).
 *
 * POST /api/agent/message returns 202 + { messageId, sessionId } at once.
 * Every outcome travels as a durable message.* event on the session SSE
 * stream (same table + Last-Event-ID resume as job events): thoughts and
 * text stream per message, heavy turns become engine jobs with an ack, and
 * the input never waits for a 30s generation.
 */

export type RouteKind =
  | "answer_quick"
  | "dock_action"
  | "create_tool"
  | "steer_task"
  | "cancel_task";

export interface RouteArgs {
  dockOp?: "open" | "close" | "list";
  dockId?: string;
  targetTaskRef?: string;
}

export interface RouteDecision {
  kind: RouteKind;
  /** 0..1. Low confidence never executes destructive intents. */
  confidence: number;
  reason: string;
  args?: RouteArgs;
}

export interface RouterState {
  workspaceId: string;
  sessionId: string;
  /** Real dock ids (builtins + installed, never store-only). */
  dockIds: string[];
  activeTasks: Array<{ id: string; type: string; status: string; prompt?: string }>;
}

export interface IntentRouter {
  route(message: string, state: RouterState): Promise<RouteDecision> | RouteDecision;
}

const PT_ARTICLES = /^(o|a|os|as|um|uma|the)\s+/i;

function cleanId(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(PT_ARTICLES, "")
    .replace(/[!?.]+$/, "")
    .trim();
}

const CANCEL_WORDS = /\b(cancel|cancela|pare|stop|interromp|abort|mata|mate)\b/i;
const TASK_WORDS = /\b(task|job|tarefa|trabalho|build|gera[cç][aã]o|generation|geração|processo)\b/i;
const AFFIRMATIVE = /^(sim|pode|confirmo|confirmar|vai|faz isso|manda|yes|ok)\b/i;
const NEGATIVE = /^(n[aã]o|deixa|esquece|no)\b/i;

/**
 * Keyword router: deterministic today, model-backed later. Pure function
 * of (message, state) — no I/O, no side effects — so tests and a future
 * small-model router can share the interface and the swap point below.
 */
export class KeywordRouter implements IntentRouter {
  route(message: string, state: RouterState): RouteDecision {
    const text = (message || "").trim();
    const lower = text.toLowerCase();

    if (CANCEL_WORDS.test(lower) && (TASK_WORDS.test(lower) || /\b(o|a|os|as|um|uma|the|esse|essa|este|esta|ele|ela)\b/i.test(lower))) {
      const ref = cleanId(
        lower
          .replace(CANCEL_WORDS, " ")
          .replace(TASK_WORDS, " ")
          .replace(/\b(o|a|os|as|um|uma|the|esse|essa|este|esta|ele|ela|do|da|dos|das|de|por favor|porfavor)\b/gi, " ")
      );
      return { kind: "cancel_task", confidence: ref ? 0.75 : 0.6, reason: "cancel keywords", args: ref ? { targetTaskRef: ref } : undefined };
    }
    if (
      /\b(muda|altera|ajusta|steer|continua|change)\b/i.test(lower) &&
      TASK_WORDS.test(lower)
    ) {
      return { kind: "steer_task", confidence: 0.55, reason: "steer keywords + task noun" };
    }

    // Fast dock path first: the English deterministic matcher, then a
    // small PT imperative matcher. Both resolve against the real dock list.
    const en = matchDeterministicCommand(text);
    if (en && (en.kind === "dock.open" || en.kind === "dock.close")) {
      const id = String((en.args as any).tabId ?? (en.args as any).id ?? "");
      if (id && state.dockIds.includes(id)) {
        return {
          kind: "dock_action",
          confidence: 0.9,
          reason: en.reason,
          args: { dockOp: en.kind === "dock.open" ? "open" : "close", dockId: id },
        };
      }
    }
    if (en && en.kind === "dock.list") {
      return { kind: "dock_action", confidence: 0.9, reason: en.reason, args: { dockOp: "list" } };
    }
    const ptOpen = /^(?:abre|abra|open)\s+(?:o\s+|a\s+|os\s+|as\s+|um\s+|uma\s+|the\s+)?(.+)$/i.exec(text);
    if (ptOpen) {
      const id = cleanId(ptOpen[1]);
      if (id && state.dockIds.includes(id)) {
        return { kind: "dock_action", confidence: 0.85, reason: `PT imperative open for "${id}"`, args: { dockOp: "open", dockId: id } };
      }
      return { kind: "dock_action", confidence: 0.85, reason: `PT imperative open for unknown id "${id}"`, args: { dockOp: "open", dockId: id } };
    }
    const ptClose = /^(?:fecha|feche|close)\s+(?:o\s+|a\s+|os\s+|as\s+|um\s+|uma\s+|the\s+)?(.+)$/i.exec(text);
    if (ptClose) {
      const id = cleanId(ptClose[1]);
      return { kind: "dock_action", confidence: 0.85, reason: `PT imperative close for "${id}"`, args: { dockOp: "close", dockId: id } };
    }
    if (/^(?:liste|mostre|mostra|list|show)\b/i.test(text)) {
      return { kind: "dock_action", confidence: 0.8, reason: "inventory request", args: { dockOp: "list" } };
    }

    // Heavy work: explicit build/create asks become engine jobs.
    if (
      /\b(cri[ea](r| uma)?|crie|build|make|monte|monta|gere|gerar|desenvolva|desenvolver|plugin|ferramenta|tool|app|tela|dashboard|viewer|site)\b/i.test(
        lower
      ) && lower.length > 12
    ) {
      return { kind: "create_tool", confidence: 0.7, reason: "build/create keywords" };
    }

    return { kind: "answer_quick", confidence: 0.5, reason: "default: quick chat turn" };
  }
}

/** Provider swap point: setRouter(new ModelRouter(...)) replaces rules. */
let activeRouter: IntentRouter = new KeywordRouter();
export function setRouter(router: IntentRouter): void {
  activeRouter = router;
}
export function getRouter(): IntentRouter {
  return activeRouter;
}

export interface StreamEvent {
  type: "delta" | "progress";
  text: string;
}

export interface AnswerContext {
  prompt: string;
  workspaceId: string;
  sessionId: string;
  llmClient?: unknown;
  onEvent?: (ev: StreamEvent) => void;
}

async function defaultAnswerQuick(ctx: AnswerContext): Promise<string> {
  const active = TaskService.listTasks({ workspaceId: ctx.workspaceId }).filter(
    (t) => t.status === "running" || t.status === "queued"
  );
  const snapshot =
    active.length === 0
      ? "No background tasks running right now."
      : `Live task snapshot (${active.length}): ` +
        active.map((t) => `${t.id} [${t.type}, ${t.status}]`).join("; ") +
        ".";
  const result = await runAgentLoop({
    prompt: ctx.prompt,
    workspaceId: ctx.workspaceId,
    sessionId: ctx.sessionId,
    history: [{ role: "system", content: snapshot } as any],
    ...(ctx.llmClient ? { llmClient: ctx.llmClient as any } : {}),
    onEvent: async (ev: AgentStepEvent) => {
      if (ev.type === "agent.text_delta" && typeof (ev.payload as any)?.delta === "string") {
        ctx.onEvent?.({ type: "delta", text: (ev.payload as any).delta });
      } else if (ev.type === "tool.start" && typeof (ev.payload as any)?.name === "string") {
        ctx.onEvent?.({ type: "progress", text: `Running ${(ev.payload as any).name}…` });
      }
    },
  });
  return result.text || "Done.";
}

export interface OrchestratorDeps {
  answerQuick?: (ctx: AnswerContext) => Promise<string>;
  startHeavy?: (task: {
    sessionId: string;
    workspaceId: string;
    type: string;
    input: Record<string, unknown>;
  }) => Promise<{ id: string }>;
}

async function defaultStartHeavy(task: {
  sessionId: string;
  workspaceId: string;
  type: string;
  input: Record<string, unknown>;
}): Promise<{ id: string }> {
  const created = await TaskService.createTask({
    sessionId: task.sessionId,
    workspaceId: task.workspaceId,
    type: task.type,
    input: task.input,
  });
  await TaskService.runTask(created);
  return { id: created.id };
}

const QUEUE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS message_queue (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    prompt TEXT NOT NULL,
    origin TEXT NOT NULL DEFAULT 'chat',
    status TEXT NOT NULL DEFAULT 'queued',
    error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_message_queue_session ON message_queue(session_id, status, created_at);
`;

export function ensureQueueTable(): void {
  db.exec(QUEUE_TABLE_SQL);
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** In-process per-session chains: order within a session, never across. */
const sessionChains = new Map<string, Promise<unknown>>();

/** Pending destructive confirmations / disambiguation choices per session. */
const pendingConfirms = new Map<string, { taskId: string }>();
const pendingChoices = new Map<string, { options: Array<{ id: string; label: string }> }>();

async function realDockIds(workspaceId: string): Promise<string[]> {
  try {
    const entries = await searchDockCatalog({ workspaceId });
    return entries.filter((e) => e.kind !== "store").map((e) => e.id);
  } catch {
    return [];
  }
}

export interface ActiveTaskSnapshot {
  id: string;
  type: string;
  status: string;
  prompt?: string;
}

function activeSnapshot(workspaceId: string): ActiveTaskSnapshot[] {
  try {
    return TaskService.listTasks({ workspaceId })
      .filter((t) => t.status === "running" || t.status === "queued")
      .map((t) => ({
        id: t.id,
        type: t.type,
        status: t.status,
        prompt: typeof t.input?.prompt === "string" ? (t.input.prompt as string).slice(0, 80) : undefined,
      }));
  } catch {
    return [];
  }
}

function statusText(tasks: ActiveTaskSnapshot[]): string {
  if (tasks.length === 0) return "Nothing running right now — the dock is idle.";
  const lines = tasks.map(
    (t, i) => `${i + 1}. ${t.id} — ${t.type} (${t.status})${t.prompt ? `: ${t.prompt}` : ""}`
  );
  return `Right now (${tasks.length} active):\n${lines.join("\n")}`;
}

/** Deterministic status questions answered without any model call. */
export function isStatusQuestion(message: string): boolean {
  return /^(como\s+est[aá]|status|andamento|o\s+que\s+(est[aá]|t[aá]|estao|estão)\s+(rolando|acontecendo|fazendo)|alguma\s+novidade|tudo\s+bem|how\s+is\s+it\s+going|what.*\brunning\b)/i.test(
    message.trim()
  );
}

export interface HandleMessageInput {
  sessionId?: string;
  workspaceId?: string;
  prompt: string;
  origin?: string;
  llmClient?: unknown;
  deps?: OrchestratorDeps;
}

/** Publish one message.* event durably + live (same resume as job events). */
function publishMessage(
  sessionId: string,
  messageId: string,
  type: "message.delta" | "message.done" | "message.error",
  payload: Record<string, unknown>
): void {
  const row = insertJobEvent(messageId, sessionId, type, payload);
  taskExecutionEngine.announceRow(row);
}

/**
 * Enqueues one message and returns its ids at once (HTTP 202). Processing
 * runs detached in session order; every outcome arrives as a durable
 * message.* event. Never awaits a job.
 */
export function queueMessage(input: HandleMessageInput): { messageId: string; sessionId: string } {
  ensureQueueTable();
  const workspaceId = input.workspaceId || "default";
  let sessionId = input.sessionId;
  if (!sessionId || !getSession(sessionId)) {
    sessionId = createSession({ workspaceId, title: input.prompt.slice(0, 60) }).id;
  }

  const messageId = newId("msg");
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO message_queue (id, session_id, workspace_id, prompt, origin, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'queued', ?, ?)`
  ).run(messageId, sessionId, workspaceId, input.prompt, input.origin || "chat", now, now);

  const chain = (sessionChains.get(sessionId) ?? Promise.resolve()).then(() =>
    processOne(messageId, input)
  );
  sessionChains.set(sessionId, chain.catch(() => {}));
  // Detached: the HTTP layer already answered 202.
  void chain.catch(() => {});
  return { messageId, sessionId };
}

async function processOne(messageId: string, input: HandleMessageInput): Promise<void> {
  const row = db
    .prepare("SELECT * FROM message_queue WHERE id = ?")
    .get(messageId) as any;
  if (!row || row.status !== "queued") return;
  db.prepare("UPDATE message_queue SET status = 'processing', updated_at = ? WHERE id = ?").run(
    new Date().toISOString(),
    messageId
  );

  const deps = input.deps ?? {};
  const answerQuick = deps.answerQuick ?? defaultAnswerQuick;
  const startHeavy = deps.startHeavy ?? defaultStartHeavy;
  const done = (payload: Record<string, unknown>) => {
    db.prepare("UPDATE message_queue SET status = 'done', updated_at = ? WHERE id = ?").run(
      new Date().toISOString(),
      messageId
    );
    publishMessage(row.session_id, messageId, "message.done", payload);
  };
  const fail = (text: string) => {
    db.prepare("UPDATE message_queue SET status = 'failed', error = ?, updated_at = ? WHERE id = ?").run(
      text,
      new Date().toISOString(),
      messageId
    );
    publishMessage(row.session_id, messageId, "message.error", { text });
  };

  try {
    const dockIds = await realDockIds(row.workspace_id);
    const active = activeSnapshot(row.workspace_id);

    // 1. Pending destructive confirmation ("sim" / "não").
    const pending = pendingConfirms.get(row.session_id);
    if (pending) {
      pendingConfirms.delete(row.session_id);
      const text = row.prompt.trim().toLowerCase();
      if (AFFIRMATIVE.test(text)) {
        const target = active.find((t) => t.id === pending.taskId);
        if (!target) {
          done({ text: "That job already finished — nothing to cancel." });
          return;
        }
        TaskService.cancelTask(pending.taskId, row.workspace_id, "user" as any);
        done({ text: `Cancelled ${pending.taskId}.`, taskId: pending.taskId });
        return;
      }
      done({ text: "Kept it running — shout if you change your mind." });
      return;
    }

    // 2. Pending disambiguation choice ("1", "o do bitcoin", ...).
    const choice = pendingChoices.get(row.session_id);
    if (choice) {
      const pick = resolveChoice(row.prompt, choice.options);
      pendingChoices.delete(row.session_id);
      if (pick) {
        const target = active.find((t) => t.id === pick);
        if (target) {
          TaskService.cancelTask(pick, row.workspace_id, "user" as any);
          done({ text: `Cancelled ${pick}.`, taskId: pick });
          return;
        }
      }
      // Fell through: treat as a fresh message below.
    }

    // 3. Deterministic status: no model call, straight from the snapshot.
    if (isStatusQuestion(row.prompt)) {
      done({ text: statusText(active) });
      return;
    }

    const decision = await activeRouter.route(row.prompt, {
      workspaceId: row.workspace_id,
      sessionId: row.session_id,
      dockIds,
      activeTasks: active,
    });

    if (decision.kind === "steer_task") {
      done({
        text: "Steering a running job isn't supported yet — cancel it and start a new one with the adjustment.",
        decision,
      });
      return;
    }

    if (decision.kind === "cancel_task") {
      handleCancel(row, decision, active, done);
      return;
    }

    if (decision.kind === "dock_action") {
      const op = decision.args?.dockOp ?? "list";
      const id = decision.args?.dockId;
      if ((op === "open" || op === "close") && id && !dockIds.includes(id)) {
        publishMessage(row.session_id, messageId, "message.error", {
          text: `Nothing called "${id}" is in your dock. Install it from the Library first.`,
          decision,
        });
        db.prepare("UPDATE message_queue SET status = 'failed', error = ?, updated_at = ? WHERE id = ?").run(
          `unknown dock id ${id}`,
          new Date().toISOString(),
          messageId
        );
        return;
      }
      const label = op === "list" ? "Here is your dock." : op === "open" ? `Opening "${id}".` : `Closing "${id}".`;
      done({ text: label, action: { op, ...(id ? { id } : {}) }, decision });
      return;
    }

    if (decision.kind === "create_tool") {
      const started = await startHeavy({
        sessionId: row.session_id,
        workspaceId: row.workspace_id,
        type: "plugin_synthesis",
        input: { prompt: row.prompt, origin: row.origin },
      });
      done({
        text: `On it — building in the background (job ${started.id}). I'll post the result here when it lands.`,
        taskId: started.id,
        prompt: row.prompt,
        decision,
      });
      return;
    }

    let full = "";
    const text = await answerQuick({
      prompt: row.prompt,
      workspaceId: row.workspace_id,
      sessionId: row.session_id,
      llmClient: input.llmClient,
      onEvent: (ev) => {
        if (ev.type === "delta" && ev.text) {
          full += ev.text;
          publishMessage(row.session_id, messageId, "message.delta", { text: ev.text });
        } else if (ev.type === "progress" && ev.text) {
          publishMessage(row.session_id, messageId, "message.delta", { text: `\n_${ev.text}_\n` });
        }
      },
    });
    if (!full && text) {
      publishMessage(row.session_id, messageId, "message.delta", { text });
    }
    done({ text });
  } catch (err: any) {
    fail(err?.message || "Couldn't handle that just now — try again.");
  }
}

/** Match "1", "o segundo", "bitcoin", id prefixes against options. */
function resolveChoice(message: string, options: Array<{ id: string; label: string }>): string | null {
  const lower = message.trim().toLowerCase();
  const num = /^\W*(\d+)\W*$/.exec(lower);
  if (num) {
    const idx = Number(num[1]) - 1;
    if (idx >= 0 && idx < options.length) return options[idx].id;
    return null;
  }
  const cleaned = cleanId(lower);
  const matches = options.filter(
    (o) =>
      o.id.toLowerCase().startsWith(cleaned) ||
      cleaned.includes(o.id.toLowerCase()) ||
      o.label.toLowerCase().includes(cleaned)
  );
  return matches.length === 1 ? matches[0].id : null;
}

function findCancelTarget(
  ref: string | undefined,
  active: ActiveTaskSnapshot[]
): ActiveTaskSnapshot | null {
  if (active.length === 0) return null;
  if (!ref) return active.length === 1 ? active[0] : null;
  const r = ref.toLowerCase();
  const matches = active.filter(
    (t) =>
      t.id.toLowerCase() === r ||
      t.id.toLowerCase().startsWith(r) ||
      t.type.toLowerCase().includes(r) ||
      (t.prompt || "").toLowerCase().includes(r)
  );
  return matches.length === 1 ? matches[0] : null;
}

function ambiguousOptions(active: ActiveTaskSnapshot[]): Array<{ id: string; label: string }> {
  return active.map((t, i) => ({
    id: t.id,
    label: `${i + 1}. ${t.id} [${t.type}]${t.prompt ? `: ${t.prompt}` : ""}`,
  }));
}

function handleCancel(
  row: any,
  decision: RouteDecision,
  active: ActiveTaskSnapshot[],
  done: (payload: Record<string, unknown>) => void
): void {
  if (active.length === 0) {
    done({ text: "Nothing running right now — the dock is idle.", decision });
    return;
  }
  const target = findCancelTarget(decision.args?.targetTaskRef, active);
  if (!target) {
    pendingChoices.set(
      row.session_id,
      { options: ambiguousOptions(active) }
    );
    done({
      text:
        `Which one?\n` +
        ambiguousOptions(active)
          .map((o) => o.label)
          .join("\n"),
      decision,
    });
    return;
  }
  if (decision.confidence < 0.7) {
    pendingConfirms.set(row.session_id, { taskId: target.id });
    done({
      text: `Cancel ${target.id} [${target.type}]? Reply "sim" to confirm.`,
      decision,
    });
    return;
  }
  TaskService.cancelTask(target.id, row.workspace_id, "user" as any);
  done({ text: `Cancelled ${target.id}.`, taskId: target.id, decision });
}

/** Boot recovery: queued/processing rows outlive their HTTP calls. */
export function recoverMessageQueue(): { recovered: number } {
  try {
    ensureQueueTable();
    const res = db
      .prepare("UPDATE message_queue SET status = 'interrupted', updated_at = ? WHERE status IN ('queued', 'processing')")
      .run(new Date().toISOString());
    return { recovered: Number((res as any).changes ?? 0) };
  } catch {
    return { recovered: 0 };
  }
}

/* ------------------------------------------------------------------ */
/* Legacy orchestrator loop compat (#211 / #212 / #213).               */
/*                                                                     */
/* The queue-based orchestrator above (slices 3/3b) replaced the fast-  */
/* model loop, but the loop/escalation/dispatcher suites still pin the */
/* old surface: dock verbs plus escalate, deterministic fast path,     */
/* heavy handoff with policy thresholds. Keep those exports alive so   */
/* the promotion stays green while the migration lands. The legacy     */
/* loop delegates to the same runAgentLoop backend; the queue path     */
/* above is untouched.                                                 */
/* ------------------------------------------------------------------ */

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

export interface EscalationHandoff {
  prompt: string;
  intent?: string;
  contextId?: string;
  workspaceId?: string;
  historySummary?: string;
  constraints?: {
    maxSteps?: number;
  };
}

export interface EscalationResult {
  ok: boolean;
  text: string;
  steps: number;
  citations: Array<{ url: string; title: string }>;
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

export const ROUTING_POLICY = {
  validationRetries: 2,
  duplicateRefusalsToStuck: 3,
  errorReturnsControl: true,
  stuckReturnsControl: true,
} as const;

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
  llmClient?: AgentLoopOptions["llmClient"];
  modelId?: string;
  tools?: AgentTool[];
  onEvent?: AgentLoopOptions["onEvent"];
  maxSteps?: number;
  agentManifest?: import("../plugins/manifest").PluginManifest;
}

export async function runOrchestratorLoop(options: OrchestratorOptions) {
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

export async function escalateToHeavyAgent(
  handoff: EscalationHandoff,
  options: HeavyRunnerOptions = {}
): Promise<EscalationResult> {
  const history = handoff.historySummary
    ? [{ role: "system" as const, content: `Prior conversation summary:\n${handoff.historySummary}` }]
    : [];
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
