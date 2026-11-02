import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  handleMessage,
  setRouter,
  getRouter,
  KeywordRouter,
  type RouterState,
} from "../server/agent/orchestrator";
import { createTask, getTask, taskExecutionEngine, type AgentTask } from "../server/agent/taskRunner";
import { listJobEvents } from "../server/workspace/sessions";
import { db } from "../server/workspace/db";

const WS = "ws-orch-inbox";
const ids: string[] = [];
const sessionIds: string[] = [];

function trackTask(id: string) {
  ids.push(id);
}

beforeEach(() => {
  taskExecutionEngine.clearBuffers();
  setRouter(new KeywordRouter());
});

afterEach(() => {
  taskExecutionEngine.clearBuffers();
  setRouter(new KeywordRouter());
  for (const id of ids) {
    try {
      db.query("DELETE FROM job_events WHERE job_id = ?").run(id);
    } catch {}
    try {
      db.query("DELETE FROM tasks WHERE id = ?").run(id);
    } catch {}
  }
  ids.length = 0;
  for (const sid of sessionIds.splice(0)) {
    try {
      db.query("DELETE FROM job_events WHERE session_id = ?").run(sid);
    } catch {}
    try {
      db.query("DELETE FROM message_queue WHERE session_id = ?").run(sid);
    } catch {}
    try {
      db.query("DELETE FROM tasks WHERE session_id = ?").run(sid);
    } catch {}
    try {
      db.query("DELETE FROM sessions WHERE id = ?").run(sid);
    } catch {}
  }
  try {
    db.query("DELETE FROM sessions WHERE workspace_id = ?").run(WS);
  } catch {}
});

function mockLlm(text: string) {
  return {
    chat: {
      completions: {
        create: async () => ({ choices: [{ message: { role: "assistant", content: text } }] }),
      },
    },
  } as any;
}

/** A heavy job that really runs 30s unless aborted (signal-aware). */
function sleepThirty(_t: AgentTask, signal: AbortSignal) {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const timer = setTimeout(() => resolve({ finished: true }), 30_000);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new Error("Aborted"));
    });
  });
}

describe("Orchestrator inbox: never awaits jobs", () => {
  it("answers 2 quick messages in seconds while a 30s job runs", async () => {
    const answers: string[] = [];
    const deps = {
      answerQuick: async (ctx: { prompt: string }) => {
        answers.push(ctx.prompt);
        return `quick: ${ctx.prompt}`;
      },
      startHeavy: async (task: { sessionId: string; workspaceId: string; type: string; input: Record<string, unknown> }) => {
        const created = createTask({
          sessionId: task.sessionId,
          workspaceId: task.workspaceId,
          type: task.type,
          input: task.input,
        });
        trackTask(created.id);
        await taskExecutionEngine.runTaskInBackground(created, { executor: sleepThirty as any });
        return { id: created.id };
      },
    };

    const start = Date.now();
    const heavy = await handleMessage({
      workspaceId: WS,
      prompt: "Create a dashboard tool for my tasks",
      deps,
    });
    if (heavy.sessionId) sessionIds.push(heavy.sessionId);
    expect(heavy.type).toBe("ack");
    const taskId = (heavy as any).taskId as string;
    expect(getTask(taskId)?.status).toBe("running");

    const r1 = await handleMessage({ workspaceId: WS, sessionId: heavy.sessionId, prompt: "como está?", deps });
    const r2 = await handleMessage({ workspaceId: WS, sessionId: heavy.sessionId, prompt: "e agora?", deps });
    const elapsed = Date.now() - start;

    expect(r1.type).toBe("reply");
    expect(r2.type).toBe("reply");
    expect(elapsed).toBeLessThan(5000);
    // FIFO order within the session.
    expect(answers).toEqual(["como está?", "e agora?"]);

    // The job result arrives later as a durable event, not inline.
    taskExecutionEngine.cancelTask(taskId);
    await new Promise((r) => setTimeout(r, 150));
    const events = listJobEvents({ jobId: taskId });
    expect(events.some((e) => e.type === "job.cancelled")).toBe(true);
  }, 15000);

  it("a slow session never blocks another session", async () => {
    const doneAt: Record<string, number> = {};
    const start = Date.now();
    const deps = {
      answerQuick: async (ctx: { prompt: string }) => {
        if (ctx.prompt === "slow one") await new Promise((r) => setTimeout(r, 1200));
        doneAt[ctx.prompt] = Date.now() - start;
        return "ok";
      },
    };
    const [a, b] = await Promise.all([
      handleMessage({ workspaceId: WS, prompt: "slow one", deps }),
      handleMessage({ workspaceId: WS, prompt: "fast other session", deps }),
    ]);
    if (a.sessionId) sessionIds.push(a.sessionId);
    if (b.sessionId) sessionIds.push(b.sessionId);
    // Different sessions: the fast one does not wait for the slow one.
    expect(doneAt["fast other session"]).toBeLessThan(600);
    expect(doneAt["slow one"]).toBeGreaterThanOrEqual(1100);
    expect(b.type).toBe("reply");
  }, 15000);

  it("dock_action opens a real dock id and rejects unknown ids", async () => {
    const open = await handleMessage({ workspaceId: WS, prompt: "open browser" });
    if (open.sessionId) sessionIds.push(open.sessionId);
    expect(open.type).toBe("dock_action");
    expect((open as any).id).toBe("browser");

    const nope = await handleMessage({ workspaceId: WS, prompt: "abre o zzz-nao-existe", sessionId: open.sessionId });
    expect(nope.type).toBe("error");
    expect((nope as any).text).toContain("zzz-nao-existe");
  });

  it("steer/cancel kinds reply unsupported (slice 2b)", async () => {
    const out = await handleMessage({ workspaceId: WS, prompt: "cancela a tarefa atual" });
    if (out.sessionId) sessionIds.push(out.sessionId);
    expect(out.type).toBe("unsupported");
  });

  it("default answer_quick runs the model (mocked) with the task snapshot", async () => {
    const out = await handleMessage({
      workspaceId: WS,
      prompt: "como está?",
      llmClient: mockLlm("All quiet."),
    });
    if (out.sessionId) sessionIds.push(out.sessionId);
    expect(out.type).toBe("reply");
    expect((out as any).text).toContain("All quiet.");
  });
});
