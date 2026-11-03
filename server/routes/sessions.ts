import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { SessionService } from "../services/sessionService";
import { TaskService } from "../services/taskService";
import { taskExecutionEngine } from "../agent/taskRunner";
import type { AgentStepEvent } from "../agent/loop";
import { callerOf, denyUnlessSession, denyUnlessWorkspace, visibleTo } from "../auth/guard";

export const sessionsRouter = new Hono();

/**
 * GET /api/sessions
 * List sessions, optionally filtered by workspaceId. Results are limited
 * to workspaces the caller may access: device-local plus owned-by-caller.
 */
sessionsRouter.get("/", async (c) => {
  const caller = await callerOf(c);
  const workspaceId = c.req.query("workspaceId");
  if (workspaceId) {
    const stop = await denyUnlessWorkspace(c, workspaceId);
    if (stop) return c.json({ sessions: [] });
  }
  const sessions = visibleTo(caller, SessionService.listSessions(workspaceId));
  return c.json({ sessions });
});

/**
 * POST /api/sessions
 * Create a new persistent work session.
 */
sessionsRouter.post("/", async (c) => {
  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON request body" }, 400);
  }

  const workspaceId = body.workspaceId || "default";
  const stop = await denyUnlessWorkspace(c, workspaceId);
  if (stop) return stop;
  const session = await SessionService.createSession({
    workspaceId,
    title: body.title,
    metadata: body.metadata,
    actor: "user",
    idempotencyKey: body.idempotencyKey,
  });

  return c.json({ session }, 201);
});

/**
 * GET /api/sessions/:id
 * Retrieve session details and transcript history.
 */
sessionsRouter.get("/:id", async (c) => {
  const sessionId = c.req.param("id");
  const stop = await denyUnlessSession(c, sessionId);
  if (stop) return stop;

  const session = SessionService.getSession(sessionId);
  const transcript = await SessionService.getTranscript(sessionId);

  return c.json({
    session,
    transcript,
  });
});

/**
 * POST /api/sessions/:id/run
 * Dispatches an asynchronous background task within the session.
 */
sessionsRouter.post("/:id/run", async (c) => {
  const sessionId = c.req.param("id");
  const stop = await denyUnlessSession(c, sessionId);
  if (stop) return stop;
  const session = SessionService.getSession(sessionId);

  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON request body" }, 400);
  }

  const prompt = body.prompt;
  if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
    return c.json({ error: "Missing required 'prompt' string field" }, 400);
  }

  const caller = await callerOf(c);
  const userId = caller.kind === "user" ? caller.user.id : "local";

  const task = await TaskService.createTask({
    sessionId,
    workspaceId: session!.workspaceId,
    type: body.type || "chat",
    input: {
      prompt: prompt.trim(),
      workspaceId: body.workspaceId,
      origin: body.origin || "chat",
      // Thread link for the background run (additive attribution; the task
      // path session carries the same link in its metadata).
      userId,
    },
    actor: "user",
    idempotencyKey: body.idempotencyKey,
  });

  // Start task asynchronously in background
  const runningTask = await TaskService.runTask(task, { actor: "user" });

  return c.json({ task: runningTask }, 202);
});

/**
 * GET /api/sessions/:id/stream
 * Connects to live SSE stream of task events for the session,
 * replaying buffered events starting from optional ?fromStep=N.
 */
sessionsRouter.get("/:id/stream", async (c) => {
  const sessionId = c.req.param("id");
  const stop = await denyUnlessSession(c, sessionId);
  if (stop) return stop;

  const fromStepParam = c.req.query("fromStep");
  const fromStep = fromStepParam !== undefined ? parseInt(fromStepParam, 10) : undefined;

  return streamSSE(c, async (stream) => {
    // Write connected confirmation
    await stream.writeSSE({
      event: "connected",
      data: JSON.stringify({ sessionId, timestamp: new Date().toISOString() }),
    });

    let active = true;

    const unsubscribe = taskExecutionEngine.subscribe(
      sessionId,
      async (event: AgentStepEvent) => {
        if (!active) return;
        try {
          await stream.writeSSE({
            event: event.type,
            data: JSON.stringify(event),
          });
        } catch {
          active = false;
        }
      },
      fromStep
    );

    // Keep connection alive or listen for disconnect
    c.req.raw.signal.addEventListener("abort", () => {
      active = false;
      unsubscribe();
    });

    // Wait until stream aborts
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
