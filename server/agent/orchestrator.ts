import { runAgentLoop } from "./loop";
import { matchDeterministicCommand } from "./dispatcher";
import { searchDockCatalog } from "./tools/dockCatalog";
import { TaskService } from "../services/taskService";
import { createSession, getSession } from "./taskRunner";
import { db } from "../workspace/db";

/**
 * Non-blocking orchestrator (slice 3).
 *
 * Every user message lands in a persisted per-session FIFO and is handled
 * fast: light turns answer inline, heavy turns (code/tool synthesis) become
 * engine jobs and return an ack with a taskId. The orchestrator never
 * awaits a job, so "como está?" and "abre o bitcoin" answer while a 30s
 * generation runs. Job results arrive later through job_events + SSE.
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
  activeTasks: Array<{ id: string; type: string; status: string }>;
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

/**
 * Keyword router: deterministic today, model-backed later. Pure function
 * of (message, state) — no I/O, no side effects — so tests and a future
 * small-model router can share the interface and the swap point below.
 */
export class KeywordRouter implements IntentRouter {
  route(message: string, state: RouterState): RouteDecision {
    const text = (message || "").trim();
    const lower = text.toLowerCase();

    // Cancel / steer name a running job. Recognized but unsupported yet.
    if (
      /\b(cancel|pare|para|stop|interromp|abort)/i.test(lower) &&
      /\b(task|job|tarefa|trabalho|build|gera[cç][aã]o|generation)\b/i.test(lower)
    ) {
      return { kind: "cancel_task", confidence: 0.6, reason: "cancel keywords + task noun" };
    }
    if (
      /\b(muda|altera|ajusta|steer|continua|change)\b/i.test(lower) &&
      /\b(task|job|tarefa|trabalho|build|gera[cç][aã]o)\b/i.test(lower)
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
      /\b(cri[ea](r| um| uma)?|crie|build|make|monte|monta|gere|gerar|desenvolva|desenvolver|plugin|ferramenta|tool|app|tela|dashboard|viewer|site)\b/i.test(
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

export interface AnswerContext {
  prompt: string;
  workspaceId: string;
  sessionId: string;
  llmClient?: unknown;
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

export type OrchestratorReply =
  | { type: "reply"; text: string; decision: RouteDecision }
  | { type: "ack"; taskId: string; text: string; decision: RouteDecision }
  | { type: "dock_action"; op: "open" | "close" | "list"; id?: string; text: string; decision: RouteDecision }
  | { type: "unsupported"; text: string; decision: RouteDecision }
  | { type: "error"; text: string; decision: RouteDecision };

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

function ensureQueueTable(): void {
  db.exec(QUEUE_TABLE_SQL);
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** In-process per-session chains: order within a session, never across. */
const sessionChains = new Map<string, Promise<unknown>>();

async function realDockIds(workspaceId: string): Promise<string[]> {
  try {
    const entries = await searchDockCatalog({ workspaceId });
    return entries.filter((e) => e.kind !== "store").map((e) => e.id);
  } catch {
    return [];
  }
}

function activeSnapshot(workspaceId: string): Array<{ id: string; type: string; status: string }> {
  try {
    return TaskService.listTasks({ workspaceId })
      .filter((t) => t.status === "running" || t.status === "queued")
      .map((t) => ({ id: t.id, type: t.type, status: t.status }));
  } catch {
    return [];
  }
}

export interface HandleMessageInput {
  sessionId?: string;
  workspaceId?: string;
  prompt: string;
  origin?: string;
  llmClient?: unknown;
  deps?: OrchestratorDeps;
}

/**
 * Enqueues one message and processes the session FIFO. Returns as soon as
 * THIS message is handled — light turns answer inline, heavy turns return
 * an ack. Never awaits a job.
 */
export async function handleMessage(input: HandleMessageInput): Promise<
  OrchestratorReply & { sessionId: string; messageId: string }
> {
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

  const chain = (sessionChains.get(sessionId!) ?? Promise.resolve()).then(() =>
    processOne(messageId, input)
  );
  sessionChains.set(sessionId!, chain.catch(() => {}));
  const reply = (await chain) as OrchestratorReply;
  return { ...reply, sessionId: sessionId!, messageId };
}

async function processOne(
  messageId: string,
  input: HandleMessageInput
): Promise<OrchestratorReply> {
  const row = db
    .prepare("SELECT * FROM message_queue WHERE id = ?")
    .get(messageId) as any;
  if (!row || row.status !== "queued") {
    return { type: "error", text: "Message already handled.", decision: { kind: "answer_quick", confidence: 0, reason: "stale" } };
  }
  db.prepare("UPDATE message_queue SET status = 'processing', updated_at = ? WHERE id = ?").run(
    new Date().toISOString(),
    messageId
  );

  const deps = input.deps ?? {};
  const answerQuick = deps.answerQuick ?? defaultAnswerQuick;
  const startHeavy = deps.startHeavy ?? defaultStartHeavy;

  try {
    const dockIds = await realDockIds(row.workspace_id);
    const decision = await activeRouter.route(row.prompt, {
      workspaceId: row.workspace_id,
      sessionId: row.session_id,
      dockIds,
      activeTasks: activeSnapshot(row.workspace_id),
    });

    let reply: OrchestratorReply;
    if (decision.kind === "steer_task" || decision.kind === "cancel_task") {
      reply = {
        type: "unsupported",
        text: "Steering and cancelling running jobs isn't supported yet — it lands right after this cut.",
        decision,
      };
    } else if (decision.kind === "dock_action") {
      const op = decision.args?.dockOp ?? "list";
      const id = decision.args?.dockId;
      if ((op === "open" || op === "close") && id && !dockIds.includes(id)) {
        reply = {
          type: "error",
          text: `Nothing called "${id}" is in your dock. Install it from the Library first.`,
          decision,
        };
      } else {
        const label = op === "list" ? "Here is your dock." : op === "open" ? `Opening "${id}".` : `Closing "${id}".`;
        reply = { type: "dock_action", op, ...(id ? { id } : {}), text: label, decision };
      }
    } else if (decision.kind === "create_tool") {
      const started = await startHeavy({
        sessionId: row.session_id,
        workspaceId: row.workspace_id,
        type: "plugin_synthesis",
        input: { prompt: row.prompt, origin: row.origin },
      });
      reply = {
        type: "ack",
        taskId: started.id,
        text: `On it — building in the background (job ${started.id}). I'll post the result here when it lands.`,
        decision,
      };
    } else {
      const text = await answerQuick({
        prompt: row.prompt,
        workspaceId: row.workspace_id,
        sessionId: row.session_id,
        llmClient: input.llmClient,
      });
      reply = { type: "reply", text, decision };
    }

    db.prepare("UPDATE message_queue SET status = 'done', updated_at = ? WHERE id = ?").run(
      new Date().toISOString(),
      messageId
    );
    return reply;
  } catch (err: any) {
    db.prepare("UPDATE message_queue SET status = 'failed', error = ?, updated_at = ? WHERE id = ?").run(
      err?.message || String(err),
      new Date().toISOString(),
      messageId
    );
    return {
      type: "error",
      text: "Couldn't handle that just now — try again.",
      decision: { kind: "answer_quick", confidence: 0, reason: "handler threw" },
    };
  }
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
