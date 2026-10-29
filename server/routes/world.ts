import { Hono } from "hono";
import { getWorldLinks, addWorldLink } from "../workspace/worldLinks";

export const worldRouter = new Hono();

/**
 * GET /api/world/links - Conceptual connections between knowledge cities.
 */
worldRouter.get("/links", async (c) => {
  const links = await getWorldLinks();
  return c.json({ success: true, count: links.length, data: links });
});

/**
 * POST /api/world/links - Record a conceptual connection { from, to, reason }.
 */
worldRouter.post("/links", async (c) => {
  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: "Invalid JSON request body" }, 400);
  }

  const result = await addWorldLink({
    from: String(body.from || ""),
    to: String(body.to || ""),
    reason: typeof body.reason === "string" ? body.reason : undefined,
  });

  if (!result.success) {
    return c.json({ success: false, error: result.error }, 400);
  }
  return c.json({ success: true, data: result.link }, 201);
});
