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

  it("replays job history after Last-Event-ID with no loss or duplication", async () => {
    const task = makeTask();
    updateTaskState(task.id, "running");
    updateTaskState(task.id, "completed", { output: { ok: true } });
    const stored = listJobEvents({ jobId: task.id });
    expect(stored.length).toBeGreaterThanOrEqual(2);
    const firstId = stored[0].id;

    const res = await app.fetch(
      new Request(`http://localhost:3000/api/tasks/stream?sessionId=${task.sessionId}`, {
        headers: { "Last-Event-ID": String(firstId) },
        signal: AbortSignal.timeout(8000),
      })
    );
    expect(res.status).toBe(200);

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let text = "";
    const deadline = Date.now() + 2500;
    // Emit one live event after subscribing, then stop reading.
    const live = (async () => {
      await new Promise((r) => setTimeout(r, 300));
      updateTaskState(task.id, "completed", { output: { ok: true, again: true } });
    })();
    try {
      while (Date.now() < deadline) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        const ids = [...text.matchAll(/^id: (\d+)$/gm)].map((m) => Number(m[1]));
        if (ids.length >= stored.length) break;
      }
    } catch {
      // Aborted on purpose once enough frames arrived.
    } finally {
      try {
        await reader.cancel();
      } catch {}
    }
    await live;

    const ids = [...text.matchAll(/^id: (\d+)$/gm)].map((m) => Number(m[1]));
    // Every replayed id is strictly after the resume point, sorted, unique.
    expect(ids.length).toBeGreaterThanOrEqual(stored.length - 1);
    expect(ids[0]).toBeGreaterThan(firstId);
    expect([...ids].sort((a, b) => a - b)).toEqual(ids);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
