import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import app from "../server/index";
import {
  createSession,
  createTask,
  getTask,
  updateTaskState,
  taskExecutionEngine,
  type AgentTask,
  type AgentStepEvent,
} from "../server/agent/taskRunner";
import { db } from "../server/workspace/db";
import { listJobEvents } from "../server/workspace/sessions";

const WS = "ws-orch-jobs";

function trackIds(id: string) {
  ids.push(id);
}
let ids: string[] = [];

beforeEach(() => {
  ids = [];
  taskExecutionEngine.clearBuffers();
});

afterEach(() => {
  taskExecutionEngine.clearBuffers();
  for (const id of ids) {
    try {
      db.query("DELETE FROM job_events WHERE job_id = ?").run(id);
    } catch {}
    try {
      db.query("DELETE FROM tasks WHERE id = ?").run(id);
    } catch {}
  }
  try {
    db.query("DELETE FROM sessions WHERE workspace_id = ?").run(WS);
  } catch {}
  try {
    db.query("DELETE FROM job_events WHERE session_id NOT IN (SELECT id FROM sessions)").run();
  } catch {}
});

function makeTask(type = "background_worker", input: Record<string, unknown> = {}): AgentTask {
  const session = createSession({ workspaceId: WS, title: "orch jobs" });
  try {
    db.query("DELETE FROM job_events WHERE session_id = ?").run(session.id);
  } catch {}
  const task = createTask({ sessionId: session.id, workspaceId: WS, type, input });
  trackIds(task.id);
  return task;
}

async function waitFor(taskId: string, status: string, timeoutMs = 4000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (getTask(taskId)?.status === status) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`Task ${taskId} never reached ${status} (now ${getTask(taskId)?.status})`);
}

describe("Orchestrator jobs: concurrency, cancel, recovery (Slice 1)", () => {
  it("runs at most 2 jobs at once; the third waits queued (FIFO pump)", async () => {
    let release!: () => void;
    const gate = new Promise<void>((res) => {
      release = res;
    });
    const started: string[] = [];
    const blocking = async (t: AgentTask) => {
      started.push(t.id);
      await gate;
      return { done: t.id };
    };

    const t1 = makeTask();
    const t2 = makeTask();
    const t3 = makeTask();
    await taskExecutionEngine.runTaskInBackground(t1, { executor: blocking });
    await taskExecutionEngine.runTaskInBackground(t2, { executor: blocking });
    await taskExecutionEngine.runTaskInBackground(t3, { executor: blocking });

    await new Promise((r) => setTimeout(r, 150));
    expect(started).toEqual([t1.id, t2.id]);
    expect(getTask(t3.id)?.status).toBe("queued");

    release();
    await waitFor(t1.id, "completed");
    await waitFor(t2.id, "completed");
    await waitFor(t3.id, "completed");
    expect(started[2]).toBe(t3.id);
    expect(getTask(t1.id)?.startedAt).toBeString();
    expect(getTask(t1.id)?.finishedAt).toBeString();
  });

  it("cancels a long job fast and closes timestamps", async () => {
    const task = makeTask("background_worker");
    const longExecutor = async (_t: AgentTask, signal: AbortSignal) => {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => resolve(), 30_000);
        signal.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(new Error("Cancelled"));
        });
      });
      return {};
    };
    await taskExecutionEngine.runTaskInBackground(task, { executor: longExecutor });
    expect(getTask(task.id)?.status).toBe("running");

    const out = taskExecutionEngine.cancelTask(task.id);
    expect(out.cancelled).toBe(true);
    expect(getTask(task.id)?.status).toBe("cancelled");
    expect(getTask(task.id)?.finishedAt).toBeString();
    const again = taskExecutionEngine.cancelTask(task.id);
    expect(again.cancelled).toBe(false);
  });

  it("times out a stuck job via input.timeoutMs", async () => {
    const task = makeTask("research", { timeoutMs: 300 });
    const stuck = async (_t: AgentTask, signal: AbortSignal) => {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => resolve(), 10_000);
        signal.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(new Error("Aborted"));
        });
      });
      return {};
    };
    await taskExecutionEngine.runTaskInBackground(task, { executor: stuck });
    await waitFor(task.id, "failed");
    expect(getTask(task.id)?.error).toContain("timed out");
  });

  it("marks running jobs interrupted on restart and records the event", async () => {
    const task = makeTask();
    updateTaskState(task.id, "running", { progress: 0.1 });
    const out = taskExecutionEngine.recoverInterruptedTasks();
    expect(out.taskIds).toContain(task.id);
    expect(getTask(task.id)?.status).toBe("interrupted");
    const events = listJobEvents({ jobId: task.id });
    expect(events.some((e) => e.type === "job.interrupted")).toBe(true);
  });
});
