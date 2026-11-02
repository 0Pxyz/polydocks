import fs from "node:fs/promises";
import path from "node:path";
import { db } from "../workspace/db";
import {
  ensureSessionTaskTables,
  mirrorTranscriptEntry,
  insertJobEvent,
  listJobEvents,
  type JobEventRow,
} from "../workspace/sessions";
import { getSessionsPath } from "../system/agentHome";
import { runAgentLoop, type AgentStepEvent } from "./loop";

/** Terminal task states: timestamps close and no further transitions apply. */
const TERMINAL_TASK_STATUSES: TaskStatus[] = ["completed", "failed", "cancelled", "interrupted"];

/** In-process worker cap: extra jobs wait in `queued` (FIFO pump on settle). */
const MAX_CONCURRENT_JOBS = 2;

/** Fallback cap per job; jobs may override via input.timeoutMs. */
const DEFAULT_JOB_TIMEOUT_MS = 30 * 60 * 1000;

/** Task types that run code in the workspace sandbox (terminate on cancel). */
const SANDBOX_TASK_TYPES = new Set(["plugin_synthesis", "background_worker"]);

export type SessionStatus = "active" | "paused" | "completed" | "archived";
export type TaskStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted";

export interface Session {
  id: string;
  workspaceId: string;
  title?: string;
  status: SessionStatus;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AgentTask {
  id: string;
  sessionId: string;
  workspaceId: string;
  type: "chat" | "plugin_synthesis" | "research" | "background_worker" | string;
  status: TaskStatus;
  progress: number;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface CreateSessionOptions {
  workspaceId: string;
  title?: string;
  metadata?: Record<string, unknown>;
  id?: string;
}

export interface CreateTaskOptions {
  sessionId: string;
  workspaceId: string;
  type?: string;
  input?: Record<string, unknown>;
  id?: string;
}

export type TaskExecutor = (
  task: AgentTask,
  signal: AbortSignal,
  emitEvent: (event: AgentStepEvent) => Promise<void>
) => Promise<Record<string, unknown> | void>;

// Canonical DDL lives in server/workspace/sessions.ts (single definition;
// schema.sql carries the same statements for fresh databases).
ensureSessionTaskTables();

/**
 * Appends a JSON-line record to agent-home/sessions/<sessionId>.jsonl and
 * mirrors it into SQLite session_transcripts (backfill; reads stay on JSONL
 * until the verification window completes).
 */
export async function appendSessionTranscript(
  sessionId: string,
  entry: Record<string, unknown>,
  rootDir?: string
): Promise<void> {
  const filePath = rootDir
    ? path.join(rootDir, "sessions", `${sessionId}.jsonl`)
    : getSessionsPath(`${sessionId}.jsonl`);

  const parentDir = path.dirname(filePath);
  await fs.mkdir(parentDir, { recursive: true });

  const record = {
    timestamp: new Date().toISOString(),
    ...entry,
  };

  await fs.appendFile(filePath, JSON.stringify(record) + "\n", "utf-8");
  mirrorTranscriptEntry(sessionId, record);
}

/**
 * Reads all parsed JSONL transcript records from agent-home/sessions/<sessionId>.jsonl
 */
export async function readSessionTranscript(
  sessionId: string,
  options?: { offset?: number; limit?: number; rootDir?: string }
): Promise<Array<Record<string, unknown>>> {
  const filePath = options?.rootDir
    ? path.join(options.rootDir, "sessions", `${sessionId}.jsonl`)
    : getSessionsPath(`${sessionId}.jsonl`);

  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
    const parsed = lines.map((line) => JSON.parse(line));

    const offset = Math.max(0, options?.offset ?? 0);
    const limit = options?.limit !== undefined ? Math.max(1, options.limit) : undefined;

    return parsed.slice(offset, limit !== undefined ? offset + limit : undefined);
  } catch {
    return [];
  }
}

/**
 * Session persistence operations
 */
export function createSession(options: CreateSessionOptions): Session {
  const now = new Date().toISOString();
  const id = options.id || `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const title = options.title || `Session ${new Date().toLocaleDateString()}`;
  const metadataJson = options.metadata ? JSON.stringify(options.metadata) : null;

  db.prepare(`
    INSERT INTO sessions (id, workspace_id, title, status, metadata_json, created_at, updated_at)
    VALUES (?, ?, ?, 'active', ?, ?, ?)
  `).run(id, options.workspaceId, title, metadataJson, now, now);

  return {
    id,
    workspaceId: options.workspaceId,
    title,
    status: "active",
    metadata: options.metadata,
    createdAt: now,
    updatedAt: now,
  };
}

export function getSession(sessionId: string, workspaceId?: string): Session | null {
  let query = "SELECT * FROM sessions WHERE id = ?";
  const params: any[] = [sessionId];

  if (workspaceId) {
    query += " AND workspace_id = ?";
    params.push(workspaceId);
  }

  const row = db.prepare(query).get(...params) as any;
  if (!row) return null;

  return {
    id: row.id,
    workspaceId: row.workspace_id,
    title: row.title,
    status: row.status as SessionStatus,
    metadata: row.metadata_json ? JSON.parse(row.metadata_json) : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listSessions(workspaceId?: string): Session[] {
  let query = "SELECT * FROM sessions";
  const params: any[] = [];

  if (workspaceId) {
    query += " WHERE workspace_id = ?";
    params.push(workspaceId);
  }

  query += " ORDER BY updated_at DESC";

  const rows = db.prepare(query).all(...params) as any[];
  return rows.map((row) => ({
    id: row.id,
    workspaceId: row.workspace_id,
    title: row.title,
    status: row.status as SessionStatus,
    metadata: row.metadata_json ? JSON.parse(row.metadata_json) : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export function updateSessionStatus(sessionId: string, status: SessionStatus): void {
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE sessions
    SET status = ?, updated_at = ?
    WHERE id = ?
  `).run(status, now, sessionId);
}

/**
 * Task persistence operations
 */
export function createTask(options: CreateTaskOptions): AgentTask {
  const now = new Date().toISOString();
  const id = options.id || `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const type = options.type || "chat";
  const inputJson = options.input ? JSON.stringify(options.input) : null;

  db.prepare(`
    INSERT INTO tasks (id, session_id, workspace_id, type, status, progress, input_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'queued', 0.0, ?, ?, ?)
  `).run(id, options.sessionId, options.workspaceId, type, inputJson, now, now);

  return {
    id,
    sessionId: options.sessionId,
    workspaceId: options.workspaceId,
    type,
    status: "queued",
    progress: 0.0,
    input: options.input,
    createdAt: now,
    updatedAt: now,
  };
}

export function getTask(taskId: string): AgentTask | null {
  const row = db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId) as any;
  if (!row) return null;

  return {
    id: row.id,
    sessionId: row.session_id,
    workspaceId: row.workspace_id,
    type: row.type,
    status: row.status as TaskStatus,
    progress: row.progress ?? 0.0,
    input: row.input_json ? JSON.parse(row.input_json) : undefined,
    output: row.output_json ? JSON.parse(row.output_json) : undefined,
    error: row.error || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at || undefined,
    finishedAt: row.finished_at || undefined,
  };
}

export function listTasks(options?: {
  sessionId?: string;
  workspaceId?: string;
  status?: string;
  limit?: number;
}): AgentTask[] {
  let query = "SELECT * FROM tasks WHERE 1=1";
  const params: any[] = [];

  if (options?.sessionId) {
    query += " AND session_id = ?";
    params.push(options.sessionId);
  }
  if (options?.workspaceId) {
    query += " AND workspace_id = ?";
    params.push(options.workspaceId);
  }
  if (options?.status) {
    query += " AND status = ?";
    params.push(options.status);
  }

  query += " ORDER BY created_at DESC";

  if (options?.limit) {
    query += " LIMIT ?";
    params.push(options.limit);
  }

  const rows = db.prepare(query).all(...params) as any[];
  return rows.map((row) => ({
    id: row.id,
    sessionId: row.session_id,
    workspaceId: row.workspace_id,
    type: row.type,
    status: row.status as TaskStatus,
    progress: row.progress ?? 0.0,
    input: row.input_json ? JSON.parse(row.input_json) : undefined,
    output: row.output_json ? JSON.parse(row.output_json) : undefined,
    error: row.error || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at || undefined,
    finishedAt: row.finished_at || undefined,
  }));
}

export function updateTaskState(
  taskId: string,
  status: TaskStatus,
  data?: { progress?: number; output?: Record<string, unknown>; error?: string }
): void {
  const now = new Date().toISOString();
  let sessionId: string | null = null;

  // State transition + durable lifecycle event in one transaction.
  db.transaction(() => {
    let query = "UPDATE tasks SET status = ?, updated_at = ?";
    const params: any[] = [status, now];

    if (status === "running") {
      query += ", started_at = COALESCE(started_at, ?)";
      params.push(now);
    }
    if ((TERMINAL_TASK_STATUSES as string[]).includes(status)) {
      query += ", finished_at = ?";
      params.push(now);
    }

    if (data?.progress !== undefined) {
      query += ", progress = ?";
      params.push(data.progress);
    }
    if (data?.output !== undefined) {
      query += ", output_json = ?";
      params.push(JSON.stringify(data.output));
    }
    if (data?.error !== undefined) {
      query += ", error = ?";
      params.push(data.error);
    }

    query += " WHERE id = ?";
    params.push(taskId);

    db.prepare(query).run(...params);

    const row = db.prepare("SELECT session_id FROM tasks WHERE id = ?").get(taskId) as any;
    sessionId = row?.session_id ?? null;
    if (sessionId) {
      insertJobEvent(taskId, sessionId, `job.${status}`, {
        status,
        ...(data?.progress !== undefined ? { progress: data.progress } : {}),
        ...(data?.error !== undefined ? { error: data.error } : {}),
      });
    }
  })();

  // Fan out to live SSE subscribers (best-effort, outside the transaction).
  if (sessionId) {
    try {
      taskExecutionEngine.fanOutSessionJob(sessionId, taskId, status);
    } catch {
      // Subscriber failure never fails the transition.
    }
  }
}

/**
 * Background Task Runner Engine
 * Manages asynchronous task lifecycle, in-memory replay buffers, and active cancellations.
 */
export class TaskExecutionEngine {
  private static instance: TaskExecutionEngine | null = null;
  private activeControllers = new Map<string, AbortController>();
  private replayBuffers = new Map<string, AgentStepEvent[]>();
  private subscribers = new Map<string, Set<(event: AgentStepEvent) => void>>();
  private jobSubscribers = new Map<string, Set<(row: JobEventRow) => void>>();
  /** FIFO of queued task ids waiting for a worker slot. */
  private pendingQueue: string[] = [];
  private maxReplayEvents = 100;

  public static getInstance(): TaskExecutionEngine {
    if (!TaskExecutionEngine.instance) {
      TaskExecutionEngine.instance = new TaskExecutionEngine();
    }
    return TaskExecutionEngine.instance;
  }

  private runningCount(): number {
    const row = db.prepare("SELECT COUNT(*) as count FROM tasks WHERE status = 'running'").get() as any;
    return row?.count ?? 0;
  }

  /**
   * Subscribes to durable job events for a session. Replays rows after
   * `afterId` first (Last-Event-ID resume), then stays live.
   */
  public subscribeJobs(
    sessionId: string,
    callback: (row: JobEventRow) => void,
    afterId?: number
  ): () => void {
    if (!this.jobSubscribers.has(sessionId)) {
      this.jobSubscribers.set(sessionId, new Set());
    }
    const set = this.jobSubscribers.get(sessionId)!;
    set.add(callback);

    for (const row of listJobEvents({ sessionId, afterId })) {
      try {
        callback(row);
      } catch {
        // A failing replay listener never breaks the subscription.
      }
    }

    return () => {
      set.delete(callback);
      if (set.size === 0) {
        this.jobSubscribers.delete(sessionId);
      }
    };
  }

  /** Delivers a durable job event row to live session subscribers. */
  public announceRow(row: JobEventRow): void {
    const set = this.jobSubscribers.get(row.sessionId);
    if (!set) return;
    for (const listener of set) {
      try {
        listener(row);
      } catch {
        // Non-fatal if subscriber handler throws.
      }
    }
  }

  /** Delivers one durable job event row to live session subscribers. */
  public fanOutSessionJob(sessionId: string, taskId: string, status: TaskStatus): void {
    const rows = listJobEvents({ sessionId, jobId: taskId, limit: 1, order: "desc" });
    const row = rows[0];
    if (!row) return;
    this.announceRow(row);
  }

  /**
   * Recovers orphaned tasks left in 'running' from previous server
   * instances. Each recovery also writes a durable job event so
   * reconnecting SSE clients learn about it without polling.
   */
  public recoverInterruptedTasks(): { recoveredCount: number; taskIds: string[] } {
    const runningRows = db.prepare("SELECT id, session_id FROM tasks WHERE status = 'running'").all() as any[];
    const taskIds = runningRows.map((r) => r.id);

    if (taskIds.length > 0) {
      const now = new Date().toISOString();
      db.transaction(() => {
        db.prepare(`
          UPDATE tasks
          SET status = 'interrupted',
              error = 'Task interrupted by server restart',
              finished_at = ?,
              updated_at = ?
          WHERE status = 'running'
        `).run(now, now);
        for (const row of runningRows) {
          insertJobEvent(row.id, row.session_id, "job.interrupted", {
            status: "interrupted",
            error: "Task interrupted by server restart",
          });
        }
      })();

      console.log(
        `[TaskRunner] Recovered ${taskIds.length} interrupted task(s) on server restart:`,
        taskIds
      );
    }

    return {
      recoveredCount: taskIds.length,
      taskIds,
    };
  }

  /**
   * Subscribes to events for a given session.
   * If fromStep is provided, automatically replays buffered events with step >= fromStep.
   */
  public subscribe(
    sessionId: string,
    callback: (event: AgentStepEvent) => void,
    fromStep?: number
  ): () => void {
    if (!this.subscribers.has(sessionId)) {
      this.subscribers.set(sessionId, new Set());
    }

    const set = this.subscribers.get(sessionId)!;
    set.add(callback);

    // Replay buffered events
    const buffer = this.replayBuffers.get(sessionId) || [];
    if (buffer.length > 0 && fromStep !== undefined) {
      for (const event of buffer) {
        if (event.step >= fromStep) {
          callback(event);
        }
      }
    }

    return () => {
      set.delete(callback);
      if (set.size === 0) {
        this.subscribers.delete(sessionId);
      }
    };
  }

  /**
   * Emits an event to session subscribers, stores it in the replay buffer,
   * and appends to the session transcript JSONL file.
   */
  public async emitEvent(
    sessionId: string,
    event: AgentStepEvent,
    rootDir?: string
  ): Promise<void> {
    // 1. Maintain in-memory replay buffer
    if (!this.replayBuffers.has(sessionId)) {
      this.replayBuffers.set(sessionId, []);
    }
    const buffer = this.replayBuffers.get(sessionId)!;
    buffer.push(event);
    if (buffer.length > this.maxReplayEvents) {
      buffer.shift();
    }

    // 2. Broadcast to live SSE subscribers
    const subs = this.subscribers.get(sessionId);
    if (subs) {
      for (const listener of subs) {
        try {
          listener(event);
        } catch {
          // Non-fatal if subscriber handler throws
        }
      }
    }

    // 3. Persist to JSONL transcript
    await appendSessionTranscript(
      sessionId,
      {
        step: event.step,
        type: event.type,
        payload: event.payload,
      },
      rootDir
    ).catch(() => {});
  }

  /**
   * Dispatches and executes an AgentTask asynchronously in the background.
   * At most MAX_CONCURRENT_JOBS run at once; the rest wait in `queued`
   * (FIFO pump on settle). Never blocks the caller: returns the task now.
   */
  public runTaskInBackground(
    task: AgentTask,
    options?: {
      executor?: TaskExecutor;
      rootDir?: string;
    }
  ): Promise<AgentTask> {
    if (this.runningCount() >= MAX_CONCURRENT_JOBS) {
      if (!this.pendingQueue.includes(task.id)) {
        this.pendingQueue.push(task.id);
      }
      updateTaskState(task.id, "queued");
      return Promise.resolve(getTask(task.id)!);
    }
    this.startTask(task, options);
    // Do not await the executionPromise synchronously — return task immediately
    return Promise.resolve(getTask(task.id)!);
  }

  /** Starts one task now (caller owns the concurrency check). */
  private startTask(
    task: AgentTask,
    options?: {
      executor?: TaskExecutor;
      rootDir?: string;
    }
  ): void {
    const controller = new AbortController();
    this.activeControllers.set(task.id, controller);

    updateTaskState(task.id, "running", { progress: 0.05 });

    const timeoutMs =
      task.input && typeof task.input.timeoutMs === "number" && task.input.timeoutMs > 0
        ? Math.min(task.input.timeoutMs, 12 * 60 * 60 * 1000)
        : DEFAULT_JOB_TIMEOUT_MS;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        controller.abort(`Job timed out after ${timeoutMs}ms`);
      } catch {
        // Already settled.
      }
    }, timeoutMs);

    // Execute detached from the immediate request
    void (async () => {
      try {
        const emit = async (ev: AgentStepEvent) => {
          await this.emitEvent(task.sessionId, ev, options?.rootDir);
        };

        if (options?.executor) {
          const res = await options.executor(task, controller.signal, emit);
          updateTaskState(task.id, "completed", {
            progress: 1.0,
            output: res ? (res as Record<string, unknown>) : { completed: true },
          });
        } else {
          // Default: execute runAgentLoop with task input. Plugin
          // lifecycle events are also written durably so the resumable
          // SSE stream carries them: a finished synthesis mounts in the
          // dock without the client polling.
          const prompt = String(task.input?.prompt || "");
          const origin = task.input?.origin === "dock-add" ? "dock-add" : "chat";

          const loopResult = await runAgentLoop({
            prompt,
            workspaceId: task.workspaceId,
            sessionId: task.sessionId,
            taskId: task.id,
            origin,
            signal: controller.signal,
            onEvent: async (ev) => {
              await emit(ev);
              if (
                ev.type === "plugin.created" ||
                ev.type === "plugin.updated" ||
                ev.type === "plugin.published"
              ) {
                const row = insertJobEvent(task.id, task.sessionId, ev.type, {
                  ...(ev.payload as Record<string, unknown>),
                  taskType: task.type,
                });
                this.announceRow(row);
              }
            },
          });

          if (controller.signal.aborted) {
            updateTaskState(task.id, timedOut ? "failed" : "cancelled", {
              error: timedOut ? `Job timed out after ${timeoutMs}ms` : "Task cancelled by user",
            });
          } else if (loopResult.status === "error") {
            updateTaskState(task.id, "failed", {
              error: loopResult.error || "Agent execution failed",
            });
          } else {
            updateTaskState(task.id, "completed", {
              progress: 1.0,
              output: { text: loopResult.text, steps: loopResult.steps },
            });
          }
        }
      } catch (err: any) {
        if (timedOut) {
          updateTaskState(task.id, "failed", {
            error: `Job timed out after ${timeoutMs}ms`,
          });
        } else if (controller.signal.aborted || err?.name === "AbortError") {
          updateTaskState(task.id, "cancelled", {
            error: "Task cancelled by user",
          });
        } else {
          updateTaskState(task.id, "failed", {
            error: err.message || String(err),
          });
        }
      } finally {
        clearTimeout(timer);
        this.activeControllers.delete(task.id);
        this.pumpQueue(options);
      }
    })();
  }

  /** Starts queued tasks while worker slots are free (FIFO). */
  private pumpQueue(options?: { executor?: TaskExecutor; rootDir?: string }): void {
    while (
      this.pendingQueue.length > 0 &&
      this.runningCount() < MAX_CONCURRENT_JOBS
    ) {
      const nextId = this.pendingQueue.shift()!;
      const next = getTask(nextId);
      // Skip tasks that settled while queued (cancelled externally).
      if (!next || next.status !== "queued") continue;
      this.startTask(next, options);
    }
  }

  /**
   * Cancels a queued or running task. Aborting the controller stops the
   * loop between steps; for sandbox-backed task types the workspace
   * sandbox is also terminated so in-sandbox work stops too (files
   * survive on the volume; a dev server there restarts on next use).
   */
  public cancelTask(
    taskId: string,
    workspaceId?: string
  ): { cancelled: boolean; task?: AgentTask; message: string } {
    const task = getTask(taskId);
    if (!task) {
      return { cancelled: false, message: `Task "${taskId}" not found.` };
    }

    if (workspaceId && task.workspaceId !== workspaceId) {
      return {
        cancelled: false,
        message: "Forbidden: Task does not belong to the requested workspace.",
      };
    }

    if (
      task.status === "completed" ||
      task.status === "cancelled" ||
      task.status === "failed" ||
      task.status === "interrupted"
    ) {
      return {
        cancelled: false,
        task,
        message: `Task is already in terminal state: ${task.status}`,
      };
    }

    // Dequeue without ever starting.
    this.pendingQueue = this.pendingQueue.filter((id) => id !== taskId);

    const controller = this.activeControllers.get(taskId);
    if (controller) {
      controller.abort();
      this.activeControllers.delete(taskId);
    }

    if (task.status === "running" && SANDBOX_TASK_TYPES.has(task.type)) {
      // Best-effort: never let a failed terminate block the cancel.
      void (async () => {
        try {
          const { sandboxTerminate } = await import("../sandbox/index");
          await sandboxTerminate(task.workspaceId);
        } catch {
          // Sandbox already gone or Modal unconfigured.
        }
      })();
    }

    updateTaskState(taskId, "cancelled", { error: "Task cancelled by user" });
    const updated = getTask(taskId)!;
    this.pumpQueue();

    return {
      cancelled: true,
      task: updated,
      message: "Task successfully cancelled.",
    };
  }

  /**
   * Clear in-memory caches (useful in tests).
   */
  public clearBuffers(): void {
    this.replayBuffers.clear();
    this.subscribers.clear();
    this.jobSubscribers.clear();
    this.pendingQueue = [];
    for (const controller of this.activeControllers.values()) {
      controller.abort();
    }
    this.activeControllers.clear();
  }
}

export const taskExecutionEngine = TaskExecutionEngine.getInstance();
