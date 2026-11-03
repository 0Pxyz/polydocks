import { Hono } from "hono";
import { internalError } from "../errors";
import { denyUnlessIdentified } from "../auth/guard";
import {
  getMemoryOverview,
  updateMemoryMd,
  recordMemory,
  recallMemory,
  deleteMemoryEntry,
} from "../agent/memory";

export const memoryRouter = new Hono();

/**
 * GET /api/agent/memory
 * Retrieves current MEMORY.md and list of recent daily logs for user inspection.
 */
memoryRouter.get("/", async (c) => {
  const blocked = await denyUnlessIdentified(c);
  if (blocked) return blocked;
  try {
    const overview = await getMemoryOverview();
    return c.json(overview);
  } catch (err: any) {
    const out = internalError("memory", err, "Failed to retrieve memory overview");
    return c.json(out.body, out.status);
  }
});

/**
 * PUT /api/agent/memory
 * Allows the user or UI to directly update or prune long-term MEMORY.md.
 */
memoryRouter.put("/", async (c) => {
  const blocked = await denyUnlessIdentified(c);
  if (blocked) return blocked;
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
    const out = internalError("memory", err, "Failed to update MEMORY.md");
    return c.json(out.body, out.status);
  }
});

/**
 * POST /api/agent/memory/record
 * Records a new memory entry.
 */
memoryRouter.post("/record", async (c) => {
  const blocked = await denyUnlessIdentified(c);
  if (blocked) return blocked;
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
    const out = internalError("memory", err, "Failed to record memory");
    return c.json(out.body, out.status);
  }
});

/**
 * POST /api/agent/memory/recall
 * Queries memory with keyword and category scoring.
 */
memoryRouter.post("/recall", async (c) => {
  const blocked = await denyUnlessIdentified(c);
  if (blocked) return blocked;
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
    const out = internalError("memory", err, "Failed to recall memories");
    return c.json(out.body, out.status);
  }
});

/**
 * DELETE /api/agent/memory/entry
 * Removes a single entry by content match (#105 inspector backend).
 * Body: { content, scope?: curated|daily|all, date?: YYYY-MM-DD }.
 */
memoryRouter.delete("/entry", async (c) => {
  const blocked = await denyUnlessIdentified(c);
  if (blocked) return blocked;
  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON request body" }, 400);
  }

  if (!body.content || typeof body.content !== "string" || body.content.trim().length === 0) {
    return c.json({ error: "Missing required 'content' field in request body" }, 400);
  }
  if (body.scope !== undefined && !["curated", "daily", "all"].includes(body.scope)) {
    return c.json({ error: "Invalid 'scope', expected curated|daily|all" }, 400);
  }

  try {
    const result = await deleteMemoryEntry({
      content: body.content,
      scope: body.scope,
      date: body.date,
    });
    if (!result.removed) {
      return c.json({ removed: false, scope: null }, 404);
    }
    return c.json({ removed: true, scope: result.scope });
  } catch (err: any) {
    const out = internalError("memory", err, "Failed to delete memory entry");
    return c.json(out.body, out.status);
  }
});
