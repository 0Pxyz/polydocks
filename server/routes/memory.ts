import { Hono } from "hono";
import {
  getMemoryOverview,
  updateMemoryMd,
  recordMemory,
  recallMemory,
} from "../agent/memory";

export const memoryRouter = new Hono();

/**
 * GET /api/agent/memory
 * Retrieves current MEMORY.md and list of recent daily logs for user inspection.
 */
memoryRouter.get("/", async (c) => {
  try {
    const overview = await getMemoryOverview();
    return c.json(overview);
  } catch (err: any) {
    return c.json({ error: `Failed to retrieve memory overview: ${err.message}` }, 500);
  }
});

/**
 * PUT /api/agent/memory
 * Allows the user or UI to directly update or prune long-term MEMORY.md.
 */
memoryRouter.put("/", async (c) => {
  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON request body" }, 400);
  }

  if (typeof body.content !== "string") {
    return c.json({ error: "Missing required 'content' string field in request body" }, 400);
  }

  try {
    const result = await updateMemoryMd(body.content);
    return c.json({ success: true, ...result });
  } catch (err: any) {
    return c.json({ error: `Failed to update MEMORY.md: ${err.message}` }, 500);
  }
});

/**
 * POST /api/agent/memory/record
 * Records a new memory entry.
 */
memoryRouter.post("/record", async (c) => {
  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON request body" }, 400);
  }

  if (!body.content || typeof body.content !== "string" || body.content.trim().length === 0) {
    return c.json({ error: "Missing required 'content' field in request body" }, 400);
  }

  try {
    const result = await recordMemory({
      content: body.content,
      category: body.category,
      durable: body.durable,
      workspaceId: body.workspaceId,
    });
    return c.json(result);
  } catch (err: any) {
    return c.json({ error: `Failed to record memory: ${err.message}` }, 500);
  }
});

/**
 * POST /api/agent/memory/recall
 * Queries memory with keyword and category scoring.
 */
memoryRouter.post("/recall", async (c) => {
  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }

  const query = typeof body.query === "string" ? body.query : "";
  const category = typeof body.category === "string" ? body.category : undefined;
  const maxTokens = typeof body.maxTokens === "number" ? body.maxTokens : undefined;

  try {
    const memories = await recallMemory({ query, category, maxTokens });
    return c.json({ query, count: memories.length, memories });
  } catch (err: any) {
    return c.json({ error: `Failed to recall memories: ${err.message}` }, 500);
  }
});
