import { Hono } from "hono";
import { DOCK_OPS, dockAction, type FacadeContext } from "../facade/shared";
import { denyUnlessSession, denyUnlessWorkspace } from "../auth/guard";

export const dockRouter = new Hono();

function ctxFrom(c: { req: { query: (k: string) => string | undefined } }, body: any): FacadeContext {
  return {
    actor: "user",
    workspaceId: body?.workspaceId || c.req.query("workspaceId"),
    sessionId: body?.sessionId || c.req.query("sessionId"),
  };
}

/**
 * POST /api/dock/action — one verb per dock control.
 * { op: tabs.list|tabs.open|tabs.pin|tabs.unpin|tabs.close|scope.enter|scope.get|appearance.apply, ...params }
 */
dockRouter.post("/action", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { op, ...params } = body ?? {};
  if (typeof op !== "string") {
    return c.json(
      { ok: false, error: `Missing op. Known: ${DOCK_OPS.join(", ")}.`, retryable: false, code: "invalid_input" },
      400
    );
  }
  const ctx = ctxFrom(c, body);
  if (ctx.sessionId) {
    const stop = await denyUnlessSession(c, ctx.sessionId);
    if (stop) return stop;
  } else if (ctx.workspaceId) {
    const stop = await denyUnlessWorkspace(c, ctx.workspaceId);
    if (stop) return stop;
  }
  const out = await dockAction(op, params ?? {}, ctx);
  if (!out.ok) {
    const status = (out as any).code === "not_found" ? 404 : 400;
    return c.json(out, status as any);
  }
  return c.json(out);
});

/**
 * POST /api/dock/appearance — theme/wallpaper/dock-style change.
 * Delegates to the apply_theme executor; emits theme.apply.
 */
dockRouter.post("/appearance", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const ctx = ctxFrom(c, body);
  if (ctx.sessionId) {
    const stop = await denyUnlessSession(c, ctx.sessionId);
    if (stop) return stop;
  } else if (ctx.workspaceId) {
    const stop = await denyUnlessWorkspace(c, ctx.workspaceId);
    if (stop) return stop;
  }
  const out = await dockAction("appearance.apply", body ?? {}, ctx);
  if (!out.ok) return c.json(out, 400);
  return c.json(out);
});
