import { Hono } from "hono";
import { ArtifactService } from "../services/artifactService";

export const artifactsRouter = new Hono();

/**
 * GET /api/artifacts
 * List artifacts in workspace.
 */
artifactsRouter.get("/", (c) => {
  const workspaceId = c.req.query("workspaceId") || "default";
  const sessionId = c.req.query("sessionId");
  const artifacts = ArtifactService.listArtifacts(workspaceId, sessionId);
  return c.json({ artifacts });
});

/**
 * POST /api/artifacts
 * Create a new artifact record.
 */
artifactsRouter.post("/", async (c) => {
  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON request body" }, 400);
  }

  if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
    return c.json({ error: "Artifact 'name' is required" }, 400);
  }

  const workspaceId = body.workspaceId || "default";
  const artifact = await ArtifactService.createArtifact({
    workspaceId,
    sessionId: body.sessionId,
    name: body.name.trim(),
    type: body.type,
    path: body.path,
    content: body.content,
    metadata: body.metadata,
    actor: "user",
    idempotencyKey: body.idempotencyKey,
  });

  return c.json({ artifact }, 201);
});

/**
 * GET /api/artifacts/:id
 * Retrieve a specific artifact.
 */
artifactsRouter.get("/:id", (c) => {
  const id = c.req.param("id");
  const artifact = ArtifactService.getArtifact(id);
  if (!artifact) {
    return c.json({ error: `Artifact "${id}" not found` }, 404);
  }
  return c.json({ artifact });
});

/**
 * DELETE /api/artifacts/:id
 * Delete an artifact.
 */
artifactsRouter.delete("/:id", (c) => {
  const id = c.req.param("id");
  const result = ArtifactService.deleteArtifact(id, "user");
  if (!result.success) {
    return c.json({ error: result.error || "Failed to delete artifact" }, 400);
  }
  return c.json({ success: true });
});
