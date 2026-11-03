import { Hono } from "hono";
import {
  agentApprovals,
  agentArtifacts,
  agentMemory,
  agentModels,
  agentSession,
  agentStatus,
  agentTask,
  type FacadeContext,
} from "../facade/shared";
import {
  callerOf,
  denyUnlessArtifact,
  denyUnlessIdentified,
  denyUnlessSession,
  denyUnlessTask,
  denyUnlessWorkspace,
} from "../auth/guard";
import { effectiveUserId } from "../auth/session";

export const agentRouter = new Hono();

function ctxFrom(c: { req: { query: (k: string) => string | undefined } }, body: any): FacadeContext {
  return {
    actor: "user",
    workspaceId: body?.workspaceId || c.req.query("workspaceId"),
    sessionId: body?.sessionId || c.req.query("sessionId"),
  };
}

/** GET /api/agent/status — runtime status (model, tinyfish, counts). */
agentRouter.get("/status", async (c) => {
  const out = await agentStatus();
  if (!out.ok) return c.json(out, 500);
  return c.json(out);
});

/** GET /api/agent/models — model roles. Secrets never leave the server. */
agentRouter.get("/models", async (c) => {
  const out = await agentModels();
  return c.json(out);
});

/** GET /api/agent/approvals — pending approval requests. */
agentRouter.get("/approvals", async (c) => {
  const out = await agentApprovals("list");
  return c.json(out);
});

/** POST /api/agent/approvals/:id — resolve one ({ decision }). */
agentRouter.post("/approvals/:id", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const out = await agentApprovals("resolve", { id: c.req.param("id"), decision: body?.decision });
  if (!out.ok) {
    const status = (out as any).code === "not_found" ? 404 : 400;
    return c.json(out, status as any);
  }
  return c.json(out);
});

/** GET /api/agent/sessions — list work sessions. */
agentRouter.get("/sessions", async (c) => {
  const stop = await denyUnlessWorkspace(c, c.req.query("workspaceId"));
  if (stop) return c.json({ ok: true, data: [] });
  const out = await agentSession("list", {
    workspaceId: c.req.query("workspaceId") || ctxFrom(c, {}).workspaceId,
  });
  if (!out.ok) return c.json(out, 400);
  return c.json(out);
});

/** GET /api/agent/sessions/:id — resume (session + transcript tail). */
agentRouter.get("/sessions/:id", async (c) => {
  const stop = await denyUnlessSession(c, c.req.param("id"));
  if (stop) return stop;
  const out = await agentSession("resume", {
    sessionId: c.req.param("id"),
    fromStep: c.req.query("fromStep") ? Number(c.req.query("fromStep")) : undefined,
  });
  if (!out.ok) return c.json(out, 404);
  return c.json(out);
});

/** GET /api/agent/tasks — list background tasks. */
agentRouter.get("/tasks", async (c) => {
  const sessionId = c.req.query("sessionId");
  const workspaceId = c.req.query("workspaceId");
  if (sessionId) {
    const stop = await denyUnlessSession(c, sessionId);
    if (stop) return c.json({ ok: true, data: [] });
  }
  if (workspaceId) {
    const stop = await denyUnlessWorkspace(c, workspaceId);
    if (stop) return c.json({ ok: true, data: [] });
  }
  const out = await agentTask("list", {
    status: c.req.query("status"),
    sessionId,
    workspaceId,
  });
  if (!out.ok) return c.json(out, 400);
  return c.json(out);
});

/** POST /api/agent/tasks/:id/cancel — cancel a background task. */
agentRouter.post("/tasks/:id/cancel", async (c) => {
  const stop = await denyUnlessTask(c, c.req.param("id"));
  if (stop) return stop;
  const out = await agentTask("cancel", { taskId: c.req.param("id") });
  if (!out.ok) return c.json(out, 400);
  return c.json(out);
});

/**
 * POST /api/agent/message — non-blocking orchestrator turn.
 * Enqueues one message in the session FIFO and answers fast: light turns
 * reply inline, heavy turns return an ack with a taskId. Never awaits a
 * job; results arrive later through job events (/api/tasks/stream).
 */
agentRouter.post("/message", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) {
    return c.json({ error: "Missing required 'prompt' field" }, 400);
  }
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId : undefined;
  const workspaceId =
    typeof body?.workspaceId === "string" ? body.workspaceId : ctxFrom(c, body).workspaceId;
  if (sessionId) {
    const stop = await denyUnlessSession(c, sessionId);
    if (stop) return stop;
  } else if (workspaceId) {
    const stop = await denyUnlessWorkspace(c, workspaceId);
    if (stop) return stop;
  }
  const { queueMessage } = await import("../agent/orchestrator");
  const out = queueMessage({
    sessionId,
    workspaceId,
    userId: effectiveUserId(await callerOf(c)),
    prompt,
    origin: body?.origin === "dock-add" ? "dock-add" : "chat",
  });
  return c.json({ success: true, ...out }, 202);
});

/** POST /api/agent/memory — { op: recall|record, ...params }. */
agentRouter.post("/memory", async (c) => {
  const stop = await denyUnlessIdentified(c);
  if (stop) return stop;
  const body = await c.req.json().catch(() => ({}));
  const { op, ...params } = body ?? {};
  const out = await agentMemory(op, params ?? {}, ctxFrom(c, body));
  if (!out.ok) return c.json(out, 400);
  return c.json(out);
});

/** GET /api/agent/artifacts — list artifacts (read-only facade over the store). */
agentRouter.get("/artifacts", async (c) => {
  const sessionId = c.req.query("sessionId");
  const workspaceId = c.req.query("workspaceId");
  if (sessionId) {
    const stop = await denyUnlessSession(c, sessionId);
    if (stop) return c.json({ ok: true, data: [] });
  }
  if (workspaceId) {
    const stop = await denyUnlessWorkspace(c, workspaceId);
    if (stop) return c.json({ ok: true, data: [] });
  }
  const out = await agentArtifacts("list", {
    workspaceId,
    sessionId,
  });
  if (!out.ok) return c.json(out, 400);
  return c.json(out);
});

/** GET /api/agent/artifacts/:id — read one artifact. */
agentRouter.get("/artifacts/:id", async (c) => {
  const stop = await denyUnlessArtifact(c, c.req.param("id"));
  if (stop) return stop;
  const out = await agentArtifacts("read", { artifactId: c.req.param("id") });
  if (!out.ok) {
    const status = (out as any).code === "not_found" ? 404 : 400;
    return c.json(out, status as any);
  }
  return c.json(out);
});
