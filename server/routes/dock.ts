import { Hono } from "hono";
import { DOCK_OPS, dockAction, type FacadeContext } from "../facade/shared";

export const dockRouter = new Hono();

function ctxFrom(c: { req: { query: (k: string) => string | undefined } }, body: any): FacadeContext {
  return {
    actor: "user",
    cityId: body?.cityId || c.req.query("cityId"),
    workspaceId: body?.workspaceId || c.req.query("workspaceId"),
    sessionId: body?.sessionId || c.req.query("sessionId"),
  };
}

/**
 * GET /api/dock/tabs — dock tabs mounted for a city/scope.
 * Delegates to the list_tabs tool executor (same as the agent uses).
 */
dockRouter.get("/tabs", async (c) => {
  const cityId = c.req.query("cityId");
  const out = await dockAction("tabs.list", cityId ? { cityId } : {}, ctxFrom(c, {}));
  if (!out.ok) return c.json(out, 400);
  return c.json(out);
});

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
  const out = await dockAction(op, params ?? {}, ctxFrom(c, body));
  if (!out.ok) {
    const status = (out as any).code === "not_found" ? 404 : 400;
    return c.json(out, status as any);
  }
  return c.json(out);
});

/**
 * POST /api/dock/scope — enter a city scope (verified entry, same check
 * the agent's enter_city uses). Emits map.changed.
 */
dockRouter.post("/scope", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const out = await dockAction("scope.enter", { cityId: body?.cityId }, ctxFrom(c, body));
  if (!out.ok) return c.json(out, 400);
  return c.json(out);
});

/**
 * POST /api/dock/appearance — theme/wallpaper/dock-style change.
 * Delegates to the apply_theme executor; emits theme.apply.
 */
dockRouter.post("/appearance", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const out = await dockAction("appearance.apply", body ?? {}, ctxFrom(c, body));
  if (!out.ok) return c.json(out, 400);
  return c.json(out);
});
