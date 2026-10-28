import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { SessionService } from "../services/sessionService";
import { TaskService } from "../services/taskService";
import { taskExecutionEngine } from "../agent/taskRunner";
import type { AgentStepEvent } from "../agent/loop";

export const sessionsRouter = new Hono();

/**
 * GET /api/sessions
 * List sessions, optionally filtered by workspaceId.
 */
sessionsRouter.get("/", (c) => {
  const workspaceId = c.req.query("workspaceId");
  const sessions = SessionService.listSessions(workspaceId);
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

  const task = await TaskService.createTask({
    sessionId,
    workspaceId: session.workspaceId,
    type: body.type || "chat",
    input: {
      prompt: prompt.trim(),
      cityId: body.cityId,
      origin: body.origin || "chat",
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
sessionsRouter.get("/:id/stream", (c) => {
  const sessionId = c.req.param("id");
  const session = SessionService.getSession(sessionId);

  if (!session) {
    return c.json({ error: `Session "${sessionId}" not found` }, 404);
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
