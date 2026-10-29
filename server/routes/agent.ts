import { Hono } from "hono";
import {
  agentApprovals,
  agentMemory,
  agentModels,
  agentSession,
  agentStatus,
  agentTask,
  type FacadeContext,
} from "../facade/shared";

export const agentRouter = new Hono();

function ctxFrom(c: { req: { query: (k: string) => string | undefined } }, body: any): FacadeContext {
  return {
    actor: "user",
    cityId: body?.cityId || c.req.query("cityId"),
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
  const out = await agentSession("list", {
    workspaceId: c.req.query("workspaceId") || ctxFrom(c, {}).workspaceId,
  });
  if (!out.ok) return c.json(out, 400);
  return c.json(out);
});

/** GET /api/agent/sessions/:id — resume (session + transcript tail). */
agentRouter.get("/sessions/:id", async (c) => {
  const out = await agentSession("resume", {
    sessionId: c.req.param("id"),
    fromStep: c.req.query("fromStep") ? Number(c.req.query("fromStep")) : undefined,
  });
  if (!out.ok) return c.json(out, 404);
  return c.json(out);
});

/** GET /api/agent/tasks — list background tasks. */
agentRouter.get("/tasks", async (c) => {
  const out = await agentTask("list", {
    status: c.req.query("status"),
    sessionId: c.req.query("sessionId"),
    workspaceId: c.req.query("workspaceId"),
  });
  if (!out.ok) return c.json(out, 400);
  return c.json(out);
});

/** POST /api/agent/tasks/:id/cancel — cancel a background task. */
agentRouter.post("/tasks/:id/cancel", async (c) => {
  const out = await agentTask("cancel", { taskId: c.req.param("id") });
  if (!out.ok) return c.json(out, 400);
  return c.json(out);
});

/** POST /api/agent/memory — { op: recall|record, ...params }. */
agentRouter.post("/memory", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { op, ...params } = body ?? {};
  const out = await agentMemory(op, params ?? {}, ctxFrom(c, body));
  if (!out.ok) return c.json(out, 400);
  return c.json(out);
});
