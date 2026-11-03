import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { TaskService } from "../services/taskService";
import { taskExecutionEngine } from "../agent/taskRunner";
import { callerOf, denyUnlessSession, denyUnlessTask, denyUnlessWorkspace, visibleTo } from "../auth/guard";

export const tasksRouter = new Hono();

/**
 * GET /api/tasks
 * Lists background tasks with optional filtering by status, sessionId, workspaceId.
 * Only tasks in accessible workspaces are returned.
 */
tasksRouter.get("/", async (c) => {
  const caller = await callerOf(c);
  const sessionId = c.req.query("sessionId");
  const workspaceId = c.req.query("workspaceId");
  const status = c.req.query("status");
  const limitParam = c.req.query("limit");
  const limit = limitParam ? parseInt(limitParam, 10) : undefined;

  if (workspaceId) {
    const stop = await denyUnlessWorkspace(c, workspaceId);
    if (stop) return c.json({ tasks: [] });
  }

  const tasks = visibleTo(
    caller,
    TaskService.listTasks({
      sessionId,
      workspaceId,
      status,
      limit,
    })
  );

  return c.json({ tasks });
});

/**
 * GET /api/tasks/stream?sessionId=&jobId=
 * Durable job-event stream with Last-Event-ID resume. Replays every stored
 * row after the given id (header wins, ?from= fallback), then stays live.
 * Reconnects never lose or duplicate events: ids are monotonic per process
 * and the replay boundary is exclusive (id > last).
 */
tasksRouter.get("/stream", async (c) => {
  const sessionId = c.req.query("sessionId");
  const jobId = c.req.query("jobId");
  if (!sessionId && !jobId) {
    return c.json({ error: "Provide sessionId and/or jobId." }, 400);
  }

  // Session-scoped streams resolve the session's workspace; job-only
  // streams resolve the task first, so neither id can escape its workspace.
  if (sessionId) {
    const stop = await denyUnlessSession(c, sessionId);
    if (stop) return stop;
  } else if (jobId) {
    const stop = await denyUnlessTask(c, jobId);
    if (stop) return stop;
  }

  const headerId = c.req.header("last-event-id");
  const queryFrom = c.req.query("from");
  const parsedHeader = headerId !== undefined && headerId !== "" ? Number(headerId) : NaN;
  const parsedQuery = queryFrom !== undefined && queryFrom !== "" ? Number(queryFrom) : NaN;
  const afterId = Number.isInteger(parsedHeader)
    ? parsedHeader
    : Number.isInteger(parsedQuery)
      ? parsedQuery
      : undefined;

  return streamSSE(c, async (stream) => {
    await stream.writeSSE({
      event: "connected",
      data: JSON.stringify({ sessionId: sessionId ?? null, jobId: jobId ?? null }),
    });

    let active = true;
    // Serialize writes: replay and live events share one FIFO so ids
    // always arrive in ascending order (EventSource relies on it).
    let chain: Promise<void> = Promise.resolve();
    const send = (id: string, type: string, data: string) => {
      chain = chain
        .then(() => stream.writeSSE({ id, event: type, data }))
        .catch(() => {
          active = false;
        });
      return chain;
    };
    const unsubscribe = taskExecutionEngine.subscribeJobs(
      // Live fan-out is keyed by session; job-only streams still replay
      // their rows above, then follow the session channel filtered by job.
      sessionId ?? "",
      (row) => {
        if (!active) return;
        if (jobId && row.jobId !== jobId) return;
        void send(String(row.id), row.type, JSON.stringify({ id: row.id, jobId: row.jobId, ...row.payload }));
      },
      afterId
    );

    // Replay and live share one subscription: set.add runs before the
    // replay loop, so a row inserted mid-replay is delivered live (its id
    // exceeds every replayed id). The boundary stays exactly-once.
    c.req.raw.signal.addEventListener("abort", () => {
      active = false;
      unsubscribe();
    });

    while (active) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      if (c.req.raw.signal.aborted) {
        active = false;
        break;
      }
    }

    unsubscribe();
  });
});

/**
 * GET /api/tasks/:id
 * Retrieve specific task details.
 */
tasksRouter.get("/:id", async (c) => {
  const stop = await denyUnlessTask(c, c.req.param("id"));
  if (stop) return stop;
  const task = TaskService.getTask(c.req.param("id"));

  return c.json({ task });
});

/**
 * POST /api/tasks/:id/cancel
 * Cancels a running background task.
 */
tasksRouter.post("/:id/cancel", async (c) => {
  const taskId = c.req.param("id");
  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }

  const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId : undefined;
  const stop = await denyUnlessTask(c, taskId);
  if (stop) return stop;
  const result = TaskService.cancelTask(taskId, workspaceId, "user");

  if (!result.cancelled && !result.task) {
    return c.json({ error: result.message }, 404);
  }

  return c.json(result);
});
