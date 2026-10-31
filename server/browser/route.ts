import { Hono } from "hono";
import { atriumCore, BROWSER_MOUNT_PATH, browserWorkerConfigured } from "./atriumHost";

/**
 * Native browser HTTP surface. All Atrium session endpoints
 * (POST /sessions, GET /sessions/:id, DELETE, navigate, control,
 * cookies, storage-state, snapshots, healthz) are served by
 * @atriumjs/core via handleRequest — this router is a thin Hono
 * passthrough plus a local health probe that never leaks the secret.
 */
export const browserRouter = new Hono();

browserRouter.get("/health", (c) => {
  return c.json({
    success: true,
    configured: browserWorkerConfigured(),
    mountPath: BROWSER_MOUNT_PATH,
    dialBase: "(redacted)",
  });
});

browserRouter.all("/*", async (c) => {
  if (!browserWorkerConfigured()) {
    return c.json({ success: false, error: "browser_unavailable" }, 503);
  }
  try {
    const res: Response = await atriumCore.handleRequest(c.req.raw);
    return res;
  } catch (err: any) {
    return c.json(
      { success: false, error: err?.message || "browser request failed" },
      502
    );
  }
});
