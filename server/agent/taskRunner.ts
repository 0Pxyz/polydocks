import fs from "node:fs/promises";
import path from "node:path";
import { db } from "../workspace/db";
import { ensureSessionTaskTables, mirrorTranscriptEntry } from "../workspace/sessions";
import { getSessionsPath } from "../system/agentHome";
import { runAgentLoop, type AgentStepEvent } from "./loop";

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
  }));
}

export function updateTaskState(
  taskId: string,
  status: TaskStatus,
  data?: { progress?: number; output?: Record<string, unknown>; error?: string }
): void {
  const now = new Date().toISOString();
  let query = "UPDATE tasks SET status = ?, updated_at = ?";
  const params: any[] = [status, now];

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
  private maxReplayEvents = 100;

  public static getInstance(): TaskExecutionEngine {
    if (!TaskExecutionEngine.instance) {
      TaskExecutionEngine.instance = new TaskExecutionEngine();
    }
    return TaskExecutionEngine.instance;
  }

  /**
   * Recovers any orphaned tasks left in 'running' state from previous server instances.
   */
  public recoverInterruptedTasks(): { recoveredCount: number; taskIds: string[] } {
    const runningRows = db.prepare("SELECT id FROM tasks WHERE status = 'running'").all() as any[];
    const taskIds = runningRows.map((r) => r.id);

    if (taskIds.length > 0) {
      const now = new Date().toISOString();
      db.prepare(`
        UPDATE tasks
        SET status = 'interrupted',
            error = 'Task interrupted by server restart',
            updated_at = ?
        WHERE status = 'running'
      `).run(now);

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
   */
  public runTaskInBackground(
    task: AgentTask,
    options?: {
      executor?: TaskExecutor;
      rootDir?: string;
    }
  ): Promise<AgentTask> {
    const controller = new AbortController();
    this.activeControllers.set(task.id, controller);

    updateTaskState(task.id, "running", { progress: 0.05 });

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
          // Default: execute runAgentLoop with task input
          const prompt = String(task.input?.prompt || "");
          const workspaceId = task.input?.workspaceId ? String(task.input.workspaceId) : undefined;
          const origin = task.input?.origin === "dock-add" ? "dock-add" : "chat";

          const loopResult = await runAgentLoop({
            prompt,
            workspaceId,
            workspaceId: task.workspaceId,
            sessionId: task.sessionId,
            taskId: task.id,
            origin,
            signal: controller.signal,
          });

          if (controller.signal.aborted) {
            updateTaskState(task.id, "cancelled", {
              error: "Task cancelled by user",
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
        if (controller.signal.aborted || err?.name === "AbortError") {
          updateTaskState(task.id, "cancelled", {
            error: "Task cancelled by user",
          });
        } else {
          updateTaskState(task.id, "failed", {
            error: err.message || String(err),
          });
        }
      } finally {
        this.activeControllers.delete(task.id);
      }
    })();

    // Do not await the executionPromise synchronously — return task immediately
    return Promise.resolve(getTask(task.id)!);
  }

  /**
   * Cancels a running task using its AbortController.
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

    if (task.status === "completed" || task.status === "cancelled" || task.status === "failed") {
      return {
        cancelled: false,
        task,
        message: `Task is already in terminal state: ${task.status}`,
      };
    }

    const controller = this.activeControllers.get(taskId);
    if (controller) {
      controller.abort();
      this.activeControllers.delete(taskId);
    }

    updateTaskState(taskId, "cancelled", { error: "Task cancelled by user" });
    const updated = getTask(taskId)!;

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
    for (const controller of this.activeControllers.values()) {
      controller.abort();
    }
    this.activeControllers.clear();
  }
}

export const taskExecutionEngine = TaskExecutionEngine.getInstance();
