import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { TaskService } from "../services/taskService";
import { taskExecutionEngine } from "../agent/taskRunner";
import { getEffectiveCaller, hasWorkspaceAccess } from "../auth/session";

export const tasksRouter = new Hono();

/**
 * GET /api/tasks
 * Lists background tasks with optional filtering by status, sessionId, workspaceId.
 * Only tasks in accessible workspaces are returned.
 */
tasksRouter.get("/", async (c) => {
  const caller = await getEffectiveCaller(c.req.raw.headers);
  const sessionId = c.req.query("sessionId");
  const workspaceId = c.req.query("workspaceId");
  const status = c.req.query("status");
  const limitParam = c.req.query("limit");
  const limit = limitParam ? parseInt(limitParam, 10) : undefined;

  if (workspaceId && !hasWorkspaceAccess(workspaceId, caller)) {
    return c.json({ tasks: [] });
  }

  const tasks = TaskService.listTasks({
    sessionId,
    workspaceId,
    status,
    limit,
  }).filter((t) => hasWorkspaceAccess(t.workspaceId, caller));

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

  const caller = await getEffectiveCaller(c.req.raw.headers);
  // Session-scoped streams check the session's workspace. Job-only streams
  // resolve the task first so a job id can never escape its workspace.
  if (sessionId) {
    const { SessionService } = await import("../services/sessionService");
    const session = SessionService.getSession(sessionId);
    if (!session) {
      return c.json({ error: `Session "${sessionId}" not found` }, 404);
    }
    if (!hasWorkspaceAccess(session.workspaceId, caller)) {
      return c.json({ error: "Not available to this account" }, 403);
    }
  } else if (jobId) {
    const task = TaskService.getTask(jobId);
    if (task && !hasWorkspaceAccess(task.workspaceId, caller)) {
      return c.json({ error: "Not available to this account" }, 403);
    }
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
  const taskId = c.req.param("id");
  const task = TaskService.getTask(taskId);

  if (!task) {
    return c.json({ error: `Task "${taskId}" not found` }, 404);
  }

  const caller = await getEffectiveCaller(c.req.raw.headers);
  if (!hasWorkspaceAccess(task.workspaceId, caller)) {
    return c.json({ error: "Not available to this account" }, 403);
  }

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
  const existing = TaskService.getTask(taskId);
  if (!existing) {
    return c.json({ error: `Task "${taskId}" not found` }, 404);
  }
  const caller = await getEffectiveCaller(c.req.raw.headers);
  if (!hasWorkspaceAccess(existing.workspaceId, caller)) {
    return c.json({ error: "Not available to this account" }, 403);
  }
  const result = TaskService.cancelTask(taskId, workspaceId, "user");

  if (!result.cancelled && !result.task) {
    return c.json({ error: result.message }, 404);
  }

  return c.json(result);
});
