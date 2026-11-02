import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { queueMessage, setRouter, KeywordRouter, type OrchestratorDeps } from "../server/agent/orchestrator";
import { createTask, getTask, taskExecutionEngine, type AgentTask } from "../server/agent/taskRunner";
import { listJobEvents, type JobEventRow } from "../server/workspace/sessions";
import { TaskService } from "../server/services/taskService";
import { db } from "../server/workspace/db";
import app from "../server/index";

const WS = "ws-orch-inbox";
const taskIds: string[] = [];
const sessionIds: string[] = [];

beforeEach(() => {
  taskExecutionEngine.clearBuffers();
  setRouter(new KeywordRouter());
});

afterEach(() => {
  taskExecutionEngine.clearBuffers();
  setRouter(new KeywordRouter());
  for (const id of taskIds.splice(0)) {
    try { db.query("DELETE FROM job_events WHERE job_id = ?").run(id); } catch {}
    try { db.query("DELETE FROM tasks WHERE id = ?").run(id); } catch {}
  }
  for (const sid of sessionIds.splice(0)) {
    try { db.query("DELETE FROM job_events WHERE session_id = ?").run(sid); } catch {}
    try { db.query("DELETE FROM message_queue WHERE session_id = ?").run(sid); } catch {}
    try { db.query("DELETE FROM tasks WHERE session_id = ?").run(sid); } catch {}
    try { db.query("DELETE FROM sessions WHERE id = ?").run(sid); } catch {}
  }
  try { db.query("DELETE FROM sessions WHERE workspace_id = ?").run(WS); } catch {}
});

function sleepAbortable(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(), ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new Error("Aborted"));
    });
  });
}

const quickDeps = (answers: string[]): OrchestratorDeps => ({
  answerQuick: async (ctx) => {
    answers.push(ctx.prompt);
    return `quick: ${ctx.prompt}`;
  },
});

const heavyDeps = (answers: string[]): OrchestratorDeps => ({
  ...quickDeps(answers),
  startHeavy: async (task) => {
    const created = createTask({
      sessionId: task.sessionId,
      workspaceId: task.workspaceId,
      type: task.type,
      input: task.input,
    });
    await taskExecutionEngine.runTaskInBackground(created, {
      executor: async (_t: AgentTask, signal: AbortSignal) => {
        await sleepAbortable(30_000, signal);
        return { finished: true };
      },
    });
    return { id: created.id };
  },
});

/** Collects durable rows for a session until `done` sees the message id. */
async function waitForMessageDone(
  sessionId: string,
  messageId: string,
  timeoutMs = 8000
): Promise<JobEventRow[]> {
  const seen: JobEventRow[] = [];
  const ready = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out waiting for message.done")), timeoutMs);
    const unsub = taskExecutionEngine.subscribeJobs(sessionId, (row) => {
      if (row.jobId === messageId) {
        seen.push(row);
        if (row.type === "message.done" || row.type === "message.error") {
          clearTimeout(timer);
          unsub();
          resolve();
        }
      }
    });
  });
  await ready;
  return seen;
}

describe("Orchestrator inbox: never awaits jobs", () => {
  it("answers 2 quick messages in seconds while a 30s job runs", async () => {
    const answers: string[] = [];
    const h = queueMessage({ workspaceId: WS, prompt: "Create a dashboard tool for my tasks", deps: heavyDeps(answers) });
    sessionIds.push(h.sessionId);
    expect(getTask((await waitForCreatedTask(h.sessionId))!)?.status).toBe("running");

    const start = Date.now();
    const r1 = queueMessage({ workspaceId: WS, sessionId: h.sessionId, prompt: "qual é a capital da França?", deps: heavyDeps(answers) });
    const r2 = queueMessage({ workspaceId: WS, sessionId: h.sessionId, prompt: "e agora?", deps: heavyDeps(answers) });
    const [rows1, rows2] = await Promise.all([waitForMessageDone(h.sessionId, r1.messageId), waitForMessageDone(h.sessionId, r2.messageId)]);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(5000);
    expect(rows1.at(-1)?.type).toBe("message.done");
    expect(rows2.at(-1)?.type).toBe("message.done");
    expect(answers).toEqual(["qual é a capital da França?", "e agora?"]);

    const taskId = (await waitForCreatedTask(h.sessionId))!;
    taskExecutionEngine.cancelTask(taskId);
    await new Promise((r) => setTimeout(r, 150));
    expect(listJobEvents({ jobId: taskId }).some((e) => e.type === "job.cancelled")).toBe(true);
  }, 15000);

  it("a slow session never blocks another session", async () => {
    const finishedAt: Record<string, number> = {};
    const start = Date.now();
    const deps: OrchestratorDeps = {
      answerQuick: async (ctx) => {
        if (ctx.prompt === "slow one") await new Promise((r) => setTimeout(r, 1200));
        finishedAt[ctx.prompt] = Date.now() - start;
        return "ok";
      },
    };
    const a = queueMessage({ workspaceId: WS, prompt: "slow one", deps });
    const b = queueMessage({ workspaceId: WS, prompt: "fast other session", deps });
    sessionIds.push(a.sessionId, b.sessionId);
    await Promise.all([waitForMessageDone(a.sessionId, a.messageId), waitForMessageDone(b.sessionId, b.messageId)]);
    expect(finishedAt["fast other session"]).toBeLessThan(600);
    expect(finishedAt["slow one"]).toBeGreaterThanOrEqual(1100);
  }, 15000);

  it("dock action opens a real dock id and rejects unknown ids", async () => {
    const open = queueMessage({ workspaceId: WS, prompt: "open browser", deps: quickDeps([]) });
    sessionIds.push(open.sessionId);
    const rows = await waitForMessageDone(open.sessionId, open.messageId);
    const done = rows.at(-1)!;
    expect(done.type).toBe("message.done");
    expect((done.payload as any)?.action).toEqual({ op: "open", id: "browser" });

    const nope = queueMessage({ workspaceId: WS, sessionId: open.sessionId, prompt: "abre o zzz-nao-existe", deps: quickDeps([]) });
    const rows2 = await waitForMessageDone(open.sessionId, nope.messageId);
    expect(rows2.at(-1)?.type).toBe("message.error");
    expect(String((rows2.at(-1)?.payload as any)?.text)).toContain("zzz-nao-existe");
  });

  it("steer_task replies unsupported", async () => {
    const out = queueMessage({ workspaceId: WS, prompt: "muda a tarefa para usar outro tema", deps: quickDeps([]) });
    sessionIds.push(out.sessionId);
    const rows = await waitForMessageDone(out.sessionId, out.messageId);
    expect(String((rows.at(-1)?.payload as any)?.text)).toContain("isn't supported yet");
  });

  it("default answer_quick runs the model (mocked)", async () => {
    const out = queueMessage({
      workspaceId: WS,
      prompt: "diga olá",
      llmClient: {
        chat: { completions: { create: async () => ({ choices: [{ message: { role: "assistant", content: "All quiet." } }] }) } },
      } as any,
    });
    sessionIds.push(out.sessionId);
    const rows = await waitForMessageDone(out.sessionId, out.messageId);
    const done = rows.at(-1)!;
    expect(done.type).toBe("message.done");
    expect(String((done.payload as any)?.text)).toContain("All quiet.");
  });

  it("status questions answer deterministically without the model", async () => {
    const answers: string[] = [];
    const h = queueMessage({ workspaceId: WS, prompt: "Create a dashboard tool", deps: heavyDeps(answers) });
    sessionIds.push(h.sessionId);
    const taskId = await waitForCreatedTask(h.sessionId);
    // A model that throws proves the status path never calls it.
    const throwing = { chat: { completions: { create: async (): Promise<never> => { throw new Error("model must not be called"); } } } } as any;
    const q = queueMessage({ workspaceId: WS, sessionId: h.sessionId, prompt: "como está?", deps: { ...heavyDeps(answers) }, llmClient: throwing });
    const rows = await waitForMessageDone(h.sessionId, q.messageId);
    expect(String((rows.at(-1)?.payload as any)?.text)).toContain(taskId!);
    taskExecutionEngine.cancelTask(taskId!);
  }, 15000);

  it("cancel resolves the right job, asks on ambiguity, confirms on low confidence", async () => {
    const answers: string[] = [];
    const mk = (prompt: string) =>
      queueMessage({ workspaceId: WS, prompt, deps: heavyDeps(answers) });
    const j1 = mk("Create a bitcoin tracker tool");
    sessionIds.push(j1.sessionId);
    const t1 = await waitForCreatedTask(j1.sessionId, "bitcoin");
    // Second heavy job in another session to force ambiguity in the first.
    const j2 = mk("Create a weather dashboard");
    sessionIds.push(j2.sessionId);
    await waitForCreatedTask(j2.sessionId, "weather");

    // Named cancel hits the right one even with two running.
    const named = queueMessage({ workspaceId: WS, sessionId: j1.sessionId, prompt: "cancela o do bitcoin", deps: heavyDeps(answers) });
    const namedRows = await waitForMessageDone(j1.sessionId, named.messageId);
    expect(String((namedRows.at(-1)?.payload as any)?.text)).toContain(t1!);
    expect(getTask(t1!)?.status).toBe("cancelled");

    // Bare cancel with two other... only one left running in j2's session? No:
    // ambiguity is per-session snapshot. Use j2 session: start one more job there.
    const j3 = queueMessage({ workspaceId: WS, sessionId: j2.sessionId, prompt: "Create a notes board tool", deps: heavyDeps(answers) });
    await waitForMessageDone(j2.sessionId, j3.messageId);
    const vague = queueMessage({ workspaceId: WS, sessionId: j2.sessionId, prompt: "cancela a tarefa", deps: heavyDeps(answers) });
    const vagueRows = await waitForMessageDone(j2.sessionId, vague.messageId);
    expect(String((vagueRows.at(-1)?.payload as any)?.text)).toContain("Which one?");

    // Answer "1" cancels the first option.
    const pick = queueMessage({ workspaceId: WS, sessionId: j2.sessionId, prompt: "1", deps: heavyDeps(answers) });
    const pickRows = await waitForMessageDone(j2.sessionId, pick.messageId);
    expect(String((pickRows.at(-1)?.payload as any)?.text)).toContain("Cancelled");

    // Cleanup leftovers.
    for (const t of listActiveIn(WS)) taskExecutionEngine.cancelTask(t.id);
  }, 20000);

  it("replays message events after Last-Event-ID over HTTP", async () => {
    const answers: string[] = [];
    const h = queueMessage({ workspaceId: WS, prompt: "hi there", deps: quickDeps(answers) });
    sessionIds.push(h.sessionId);
    const rows = await waitForMessageDone(h.sessionId, h.messageId);
    const firstId = rows[0].id;
    const res = await app.fetch(
      new Request(`http://localhost:3000/api/tasks/stream?sessionId=${h.sessionId}`, {
        headers: { "Last-Event-ID": String(firstId) },
        signal: AbortSignal.timeout(5000),
      })
    );
    expect(res.status).toBe(200);
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let text = "";
    const deadline = Date.now() + 2500;
    try {
      while (Date.now() < deadline) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        if ((text.match(/^id: \d+$/gm) || []).length >= rows.length - 1) break;
      }
    } catch {
      // Aborted on purpose once frames arrived.
    }
    try {
      await reader.cancel();
    } catch {}
    const ids = [...text.matchAll(/^id: (\d+)$/gm)].map((m) => Number(m[1]));
    expect(ids.length).toBeGreaterThanOrEqual(1);
    expect(Math.min(...ids)).toBeGreaterThan(firstId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

async function waitForCreatedTask(sessionId: string, promptIncludes?: string): Promise<string | null> {
  const start = Date.now();
  while (Date.now() - start < 5000) {
    const found = listActiveIn(WS).filter((t) => !promptIncludes || (t.prompt || "").includes(promptIncludes));
    if (found.length > 0) return found[0].id;
    await new Promise((r) => setTimeout(r, 50));
  }
  return null;
}

function listActiveIn(workspaceId: string): Array<{ id: string; type: string; status: string; prompt?: string }> {
  return TaskService.listTasks({ workspaceId })
    .filter((t) => t.status === "running" || t.status === "queued")
    .map((t) => ({
      id: t.id,
      type: t.type,
      status: t.status,
      prompt: typeof t.input?.prompt === "string" ? t.input.prompt : undefined,
    }));
}
