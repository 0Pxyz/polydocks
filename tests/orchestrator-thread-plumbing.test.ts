import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { clearAgentThread } from "../server/workspace/thread";
import { db } from "../server/workspace/db";

const WS = "ws-thread-heavy";
const TU = "thread_plumb_heavy";

async function waitFor(cond: () => boolean, timeoutMs = 8000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (cond()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("timed out waiting for condition");
}

/**
 * Heavy-path owner plumbing (#307): the background task row carries the
 * turn owner from creation through to the runAgentLoop call, so the
 * worker turn persists to the right thread. Hermetic: no model, no
 * fetch, no module mocks (the OpenAI client binds fetch at import,
 * so fetch stubs are order-fragile).
 */
describe("orchestrator thread plumbing (#307)", () => {
  beforeEach(() => {
    clearAgentThread(TU);
  });
  afterEach(() => {
    clearAgentThread(TU);
    try {
      db.query("DELETE FROM sessions WHERE workspace_id = ?").run(WS);
    } catch {}
    try {
      db.query("DELETE FROM tasks WHERE workspace_id = ?").run(WS);
    } catch {}
    try {
      db.query("DELETE FROM message_queue WHERE workspace_id = ?").run(WS);
    } catch {}
  });

  it("carries the turn owner from task input to the loop options", async () => {
    const { createSession, createTask, getTask, buildTaskLoopOptions } = await import(
      "../server/agent/taskRunner"
    );
    const session = createSession({ workspaceId: WS, title: "heavy probe" });
    const task = await createTask({
      sessionId: session.id,
      workspaceId: WS,
      type: "chat",
      input: { prompt: "heavy plumbing probe", userId: TU },
    });

    // Owner survives the SQLite round-trip.
    const stored = getTask(task.id);
    expect((stored?.input as any)?.userId).toBe(TU);

    // The default executor forwards it to the loop (persistence key).
    const noop = async () => {};
    const options = buildTaskLoopOptions(stored!, {
      prompt: "heavy plumbing probe",
      origin: "chat",
      signal: new AbortController().signal,
      onLoopEvent: noop,
    });
    expect(options.userId).toBe(TU);
    expect(options.taskId).toBe(task.id);
    expect(options.workspaceId).toBe(WS);
    await waitFor(() => getTask(task.id)?.id === task.id);
  });
});
