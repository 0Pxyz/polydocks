import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  createSession,
  createTask,
  getTask,
  updateTaskState,
  taskExecutionEngine,
  type AgentTask,
} from "../server/agent/taskRunner";
import { approvalManager } from "../server/plugins/approval";
import { requestTaskApproval } from "../server/agent/installPolicy";
import { db } from "../server/workspace/db";
import { listJobEvents } from "../server/workspace/sessions";

const WS = "ws-awaiting-approval";
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
});

function makeTask(): AgentTask {
  const session = createSession({ workspaceId: WS, title: "approval probe" });
  const task = createTask({ sessionId: session.id, workspaceId: WS, type: "background_worker", input: {} });
  ids.push(task.id);
  return task;
}

/**
 * awaiting_approval state (#315): background jobs park visibly instead of
 * failing silently when they only need approval.
 */
describe("awaiting_approval job state (#315)", () => {
  it("parks and recovers: awaiting_approval is non-terminal, restart marks it interrupted", () => {
    const task = makeTask();
    updateTaskState(task.id, "awaiting_approval");
    expect(getTask(task.id)?.status).toBe("awaiting_approval");
    expect(getTask(task.id)?.finishedAt).toBeUndefined();

    const out = taskExecutionEngine.recoverInterruptedTasks();
    expect(out.taskIds).toContain(task.id);
    expect(getTask(task.id)?.status).toBe("interrupted");
    const events = listJobEvents({ sessionId: task.sessionId });
    expect(events.some((e) => e.type === "job.interrupted")).toBe(true);
  });

  it("requestTaskApproval stays fail-closed without a task context", async () => {
    const before = approvalManager.listPending().length;
    expect(await requestTaskApproval(undefined, {
      pluginId: "probe", capabilityId: "probe.run", scope: "workspace:default", summary: "probe",
    })).toBe(false);
    expect(await requestTaskApproval({} as any, {
      pluginId: "probe", capabilityId: "probe.run", scope: "workspace:default", summary: "probe",
    })).toBe(false);
    expect(approvalManager.listPending().length).toBe(before);
  });

  it("requestTaskApproval asks through the task emit and honors the decision", async () => {
    const task = makeTask();
    const seen: Array<{ type: string; payload: Record<string, unknown> }> = [];
    const pending = requestTaskApproval(
      {
        taskId: task.id,
        step: 1,
        onEvent: async (e) => {
          seen.push({ type: e.type, payload: e.payload });
        },
      },
      { pluginId: "probe", capabilityId: "probe.run", scope: `workspace:${WS}`, summary: "probe approval" }
    );

    const started = Date.now();
    let approvalId = "";
    while (Date.now() - started < 2000) {
      const found = approvalManager.listPending().find((p) => p.capabilityId === "probe.run");
      if (found) {
        approvalId = found.id;
        break;
      }
      await new Promise((r) => setTimeout(r, 25));
    }
    expect(approvalId).not.toBe("");
    expect(seen.some((e) => e.type === "approval.requested")).toBe(true);

    expect(approvalManager.resolveApproval(approvalId, "allow_once")).toBe(true);
    expect(await pending).toBe(true);
  });

  it("denied background approval resolves to false", async () => {
    const task = makeTask();
    const pending = requestTaskApproval(
      { taskId: task.id, step: 1, onEvent: async () => {} },
      { pluginId: "probe", capabilityId: "probe.stop", scope: `workspace:${WS}`, summary: "probe denial" }
    );
    const started = Date.now();
    let approvalId = "";
    while (Date.now() - started < 2000) {
      const found = approvalManager.listPending().find((p) => p.capabilityId === "probe.stop");
      if (found) {
        approvalId = found.id;
        break;
      }
      await new Promise((r) => setTimeout(r, 25));
    }
    expect(approvalId).not.toBe("");
    expect(approvalManager.resolveApproval(approvalId, "deny")).toBe(true);
    expect(await pending).toBe(false);
  });
});
