import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { SessionService } from "../services/sessionService";
import { TaskService } from "../services/taskService";
import { taskExecutionEngine } from "../agent/taskRunner";
import type { AgentStepEvent } from "../agent/loop";
import { effectiveUserId, getEffectiveCaller, hasWorkspaceAccess } from "../auth/session";

export const sessionsRouter = new Hono();

/**
 * GET /api/sessions
 * List sessions, optionally filtered by workspaceId. Results are limited
 * to workspaces the caller may access: device-local plus owned-by-caller.
 */
sessionsRouter.get("/", async (c) => {
  const caller = await getEffectiveCaller(c.req.raw.headers);
  const workspaceId = c.req.query("workspaceId");
  if (workspaceId && !hasWorkspaceAccess(workspaceId, caller)) {
    return c.json({ sessions: [] });
  }
  const sessions = SessionService.listSessions(workspaceId).filter((s) =>
    hasWorkspaceAccess(s.workspaceId, caller)
  );
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
  const caller = await getEffectiveCaller(c.req.raw.headers);
  if (!hasWorkspaceAccess(workspaceId, caller)) {
    return c.json({ error: "Not available to this account" }, 403);
  }
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
  const workspaceId = c.req.query("workspaceId");
  const session = SessionService.getSession(sessionId, workspaceId);

  if (!session) {
    return c.json({ error: `Session "${sessionId}" not found` }, 404);
  }

  const caller = await getEffectiveCaller(c.req.raw.headers);
  if (!hasWorkspaceAccess(session.workspaceId, caller)) {
    return c.json({ error: "Not available to this account" }, 403);
  }

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
  const session = SessionService.getSession(sessionId);

  if (!session) {
    return c.json({ error: `Session "${sessionId}" not found` }, 404);
  }

  const caller = await getEffectiveCaller(c.req.raw.headers);
  if (!hasWorkspaceAccess(session.workspaceId, caller)) {
    return c.json({ error: "Not available to this account" }, 403);
  }

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

  const userId = effectiveUserId(caller);

  const task = await TaskService.createTask({
    sessionId,
    workspaceId: session.workspaceId,
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
  const session = SessionService.getSession(sessionId);

  if (!session) {
    return c.json({ error: `Session "${sessionId}" not found` }, 404);
  }

  const caller = await getEffectiveCaller(c.req.raw.headers);
  if (!hasWorkspaceAccess(session.workspaceId, caller)) {
    return c.json({ error: "Not available to this account" }, 403);
  }

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
