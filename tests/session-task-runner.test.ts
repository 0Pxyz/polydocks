import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";
import { initAgentHome } from "../server/system/agentHome";
import {
  createSession,
  getSession,
  listSessions,
  createTask,
  getTask,
  listTasks,
  updateTaskState,
  taskExecutionEngine,
  appendSessionTranscript,
  readSessionTranscript,
  type AgentTask,
} from "../server/agent/taskRunner";
import type { AgentStepEvent } from "../server/agent/loop";
import app from "../server/index";

describe("Persistent Work Sessions & Background Task Engine (Issue #76)", () => {
  const TEST_ROOT = path.resolve(process.cwd(), "test-sessions-fixture");
  const originalEnv = process.env.AGENT_HOME_DIR;

  beforeEach(async () => {
    process.env.AGENT_HOME_DIR = TEST_ROOT;
    await fs.rm(TEST_ROOT, { recursive: true, force: true }).catch(() => {});
    await initAgentHome(TEST_ROOT);
    taskExecutionEngine.clearBuffers();
  });

  afterEach(async () => {
    taskExecutionEngine.clearBuffers();
    if (originalEnv !== undefined) {
      process.env.AGENT_HOME_DIR = originalEnv;
    } else {
      delete process.env.AGENT_HOME_DIR;
    }
    await fs.rm(TEST_ROOT, { recursive: true, force: true }).catch(() => {});
  });

  describe("Session Persistence in SQLite & JSONL Transcript", () => {
    it("creates, retrieves, and lists persistent sessions", () => {
      const sess = createSession({
        workspaceId: "ws-research",
        title: "Deep Stoicism Research Session",
        metadata: { focus: "Marcus Aurelius" },
      });

      expect(sess.id).toBeTruthy();
      expect(sess.workspaceId).toBe("ws-research");
      expect(sess.status).toBe("active");
      expect(sess.metadata?.focus).toBe("Marcus Aurelius");

      const fetched = getSession(sess.id, "ws-research");
      expect(fetched).not.toBeNull();
      expect(fetched?.title).toBe("Deep Stoicism Research Session");

      // Verify workspace filtering
      const wsList = listSessions("ws-research");
      expect(wsList.some((s) => s.id === sess.id)).toBe(true);

      const otherWsList = listSessions("ws-other");
      expect(otherWsList.some((s) => s.id === sess.id)).toBe(false);
    });

    it("appends and reads JSONL transcripts in agent-home/sessions/", async () => {
      const sessionId = "test-session-jsonl-1";

      await appendSessionTranscript(
        sessionId,
        { step: 1, type: "agent.start", prompt: "Hello Polymax" },
        TEST_ROOT
      );
      await appendSessionTranscript(
        sessionId,
        { step: 2, type: "tool.start", tool: "search_web" },
        TEST_ROOT
      );
      await appendSessionTranscript(
        sessionId,
        { step: 3, type: "agent.finish", result: "Done" },
        TEST_ROOT
      );

      const records = await readSessionTranscript(sessionId, { rootDir: TEST_ROOT });
      expect(records.length).toBe(3);
      expect(records[0].step).toBe(1);
      expect(records[1].tool).toBe("search_web");
      expect(records[2].result).toBe("Done");

      // Test offset pagination
      const paged = await readSessionTranscript(sessionId, { offset: 1, limit: 1, rootDir: TEST_ROOT });
      expect(paged.length).toBe(1);
      expect(paged[0].step).toBe(2);
    });
  });

  describe("Detached Background Task Execution & Replay", () => {
    it("runs background task asynchronously and updates progress to completion", async () => {
      const session = createSession({ workspaceId: "ws-det", title: "Detached Task Test" });
      const task = createTask({
        sessionId: session.id,
        workspaceId: "ws-det",
        type: "research",
        input: { topic: "Quantum Computing" },
      });

      expect(task.status).toBe("queued");

      // Custom mock executor that simulates asynchronous multistep work
      const executor = async (
        t: AgentTask,
        signal: AbortSignal,
        emit: (ev: AgentStepEvent) => Promise<void>
      ) => {
        await emit({ step: 1, type: "agent.start", payload: { topic: t.input?.topic } });
        await new Promise((r) => setTimeout(r, 20));
        await emit({ step: 2, type: "tool.done", payload: { found: 5 } });
        return { summary: "Quantum research complete" };
      };

      // Launch in background
      await taskExecutionEngine.runTaskInBackground(task, {
        executor,
        rootDir: TEST_ROOT,
      });

      // Wait a bit for execution to finish
      await new Promise((r) => setTimeout(r, 60));

      const updated = getTask(task.id);
      expect(updated?.status).toBe("completed");
      expect(updated?.progress).toBe(1.0);
      expect(updated?.output?.summary).toBe("Quantum research complete");

      // Verify transcript was saved in JSONL
      const transcript = await readSessionTranscript(session.id, { rootDir: TEST_ROOT });
      expect(transcript.length).toBeGreaterThanOrEqual(2);
    });

    it("replays buffered events for clients reconnecting late", async () => {
      const session = createSession({ workspaceId: "ws-replay", title: "Replay Test" });

      // Emit events prior to client subscription
      await taskExecutionEngine.emitEvent(session.id, { step: 1, type: "agent.start" }, TEST_ROOT);
      await taskExecutionEngine.emitEvent(session.id, { step: 2, type: "tool.start" }, TEST_ROOT);
      await taskExecutionEngine.emitEvent(session.id, { step: 3, type: "tool.done" }, TEST_ROOT);

      // Client connects late and asks to replay starting from step 2
      const receivedEvents: AgentStepEvent[] = [];
      const unsubscribe = taskExecutionEngine.subscribe(
        session.id,
        (ev) => {
          receivedEvents.push(ev);
        },
        2 // fromStep
      );

      // Should receive steps 2 and 3 immediately from replay buffer
      expect(receivedEvents.length).toBe(2);
      expect(receivedEvents[0].step).toBe(2);
      expect(receivedEvents[1].step).toBe(3);

      // Further live events should also be received
      await taskExecutionEngine.emitEvent(session.id, { step: 4, type: "agent.finish" }, TEST_ROOT);
      expect(receivedEvents.length).toBe(3);
      expect(receivedEvents[2].step).toBe(4);

      unsubscribe();
    });
  });

  describe("Task Cancellation via AbortSignal", () => {
    it("cancels an active running task cleanly", async () => {
      const session = createSession({ workspaceId: "ws-cancel" });
      const task = createTask({
        sessionId: session.id,
        workspaceId: "ws-cancel",
        type: "long_job",
      });

      let wasCancelled = false;
      const longExecutor = async (
        _t: AgentTask,
        signal: AbortSignal,
        _emit: (ev: AgentStepEvent) => Promise<void>
      ) => {
        return new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => resolve(), 5000);
          signal.addEventListener("abort", () => {
            clearTimeout(timer);
            wasCancelled = true;
            reject(new Error("Cancelled"));
          });
        });
      };

      await taskExecutionEngine.runTaskInBackground(task, {
        executor: longExecutor,
        rootDir: TEST_ROOT,
      });

      // Task is now running
      const runningTask = getTask(task.id);
      expect(runningTask?.status).toBe("running");

      const activeTasks = listTasks({ sessionId: session.id, status: "running" });
      expect(activeTasks.length).toBe(1);
      expect(activeTasks[0].id).toBe(task.id);

      // Cancel task
      const cancelRes = taskExecutionEngine.cancelTask(task.id, "ws-cancel");
      expect(cancelRes.cancelled).toBe(true);

      await new Promise((r) => setTimeout(r, 30));

      const cancelledTask = getTask(task.id);
      expect(cancelledTask?.status).toBe("cancelled");
      expect(cancelledTask?.error).toContain("cancelled");
      expect(wasCancelled).toBe(true);
    });

    it("prevents cancelling task with mismatched workspaceId guard", () => {
      const session = createSession({ workspaceId: "ws-safe" });
      const task = createTask({ sessionId: session.id, workspaceId: "ws-safe" });

      const res = taskExecutionEngine.cancelTask(task.id, "ws-attacker");
      expect(res.cancelled).toBe(false);
      expect(res.message).toContain("Forbidden");
    });
  });

  describe("Server Restart Recovery", () => {
    it("recovers orphaned running tasks into interrupted state", () => {
      const session = createSession({ workspaceId: "ws-crash" });
      const orphan = createTask({ sessionId: session.id, workspaceId: "ws-crash" });

      // Directly mark task running in SQLite (as if server crashed mid-execution)
      updateTaskState(orphan.id, "running", { progress: 0.4 });
      expect(getTask(orphan.id)?.status).toBe("running");

      // Run recovery hook
      const recovery = taskExecutionEngine.recoverInterruptedTasks();
      expect(recovery.recoveredCount).toBeGreaterThanOrEqual(1);
      expect(recovery.taskIds).toContain(orphan.id);

      const recoveredTask = getTask(orphan.id);
      expect(recoveredTask?.status).toBe("interrupted");
      expect(recoveredTask?.error).toContain("interrupted by server restart");
    });
  });

  describe("Session & Task REST Endpoints", () => {
    it("POST /api/sessions creates session and GET /api/sessions lists it", async () => {
      const createRes = await app.fetch(
        new Request("http://localhost/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId: "ws-api-1",
            title: "REST Session",
          }),
        })
      );

      expect(createRes.status).toBe(201);
      const createData = (await createRes.json()) as any;
      expect(createData.session.title).toBe("REST Session");

      const listRes = await app.fetch(
        new Request("http://localhost/api/sessions?workspaceId=ws-api-1")
      );
      expect(listRes.status).toBe(200);
      const listData = (await listRes.json()) as any;
      expect(listData.sessions.length).toBeGreaterThanOrEqual(1);
    });

    it("POST /api/sessions/:id/run launches detached task", async () => {
      const session = createSession({ workspaceId: "ws-api-run", title: "API Run Test" });

      const runRes = await app.fetch(
        new Request(`http://localhost/api/sessions/${session.id}/run`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: "Synthesize notes on distributed consensus",
            cityId: "distributed-systems",
          }),
        })
      );

      expect(runRes.status).toBe(202);
      const runData = (await runRes.json()) as any;
      expect(runData.task.sessionId).toBe(session.id);
      expect(runData.task.status).toBe("running");
    });

    it("POST /api/tasks/:id/cancel cancels running task via API", async () => {
      const session = createSession({ workspaceId: "ws-api-cancel" });
      const task = createTask({ sessionId: session.id, workspaceId: "ws-api-cancel" });
      updateTaskState(task.id, "running");

      const cancelRes = await app.fetch(
        new Request(`http://localhost/api/tasks/${task.id}/cancel`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceId: "ws-api-cancel" }),
        })
      );

      expect(cancelRes.status).toBe(200);
      const cancelData = (await cancelRes.json()) as any;
      expect(cancelData.cancelled).toBe(true);
      expect(cancelData.task.status).toBe("cancelled");
    });
  });
});
