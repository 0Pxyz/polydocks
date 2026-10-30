import { Hono } from "hono";
import { WorkspaceService } from "../services/workspaceService";
import { readFeature } from "../workspace/features";

export const workspacesRouter = new Hono();

/**
 * GET /api/workspaces - Lists all workspaces
 */
workspacesRouter.get("/", (c) => {
  const workspaces = WorkspaceService.listWorkspaces();
  return c.json({ success: true, count: workspaces.length, data: workspaces });
});

/**
 * POST /api/workspaces - Creates a new workspace
 */
workspacesRouter.post("/", async (c) => {
  try {
    const body = await c.req.json();
    if (!body || typeof body.name !== "string" || !body.name.trim()) {
      return c.json({ success: false, error: "Workspace name is required" }, 400);
    }

    const ws = await WorkspaceService.createWorkspace({
      id: body.id,
      name: body.name,
      description: body.description,
      icon: body.icon,
      isDefault: body.isDefault,
      actor: "user",
      idempotencyKey: body.idempotencyKey,
    });

    return c.json({ success: true, data: ws }, 201);
  } catch (err: any) {
    return c.json({ success: false, error: err.message || "Failed to create workspace" }, 500);
  }
});

/**
 * GET /api/workspaces/:id - Retrieves a specific workspace
 */
workspacesRouter.get("/:id", (c) => {
  const id = c.req.param("id");
  const ws = WorkspaceService.getWorkspace(id);
  if (!ws) {
    return c.json({ success: false, error: "Workspace not found" }, 404);
  }
  return c.json({ success: true, data: ws });
});

/**
 * PUT /api/workspaces/:id - Updates workspace details
 */
workspacesRouter.put("/:id", async (c) => {
  const id = c.req.param("id");
  try {
    const body = await c.req.json();
    const updated = WorkspaceService.updateWorkspace(id, {
      name: body.name,
      description: body.description,
      icon: body.icon,
      actor: "user",
    });

    if (!updated) {
      return c.json({ success: false, error: "Workspace not found" }, 404);
    }
    return c.json({ success: true, data: updated });
  } catch (err: any) {
    return c.json({ success: false, error: err.message || "Failed to update workspace" }, 500);
  }
});

/**
 * DELETE /api/workspaces/:id - Deletes a workspace
 */
workspacesRouter.delete("/:id", (c) => {
  const id = c.req.param("id");
  const result = WorkspaceService.deleteWorkspace(id, "user");
  if (!result.success) {
    return c.json({ success: false, error: result.error || "Cannot delete workspace" }, 400);
  }
  return c.json({ success: true });
});

/**
 * GET /api/workspaces/:id/plugins - Lists plugins mounted in this workspace
 */
workspacesRouter.get("/:id/plugins", async (c) => {
  const id = c.req.param("id");
  const ws = WorkspaceService.getWorkspace(id);
  if (!ws) {
    return c.json({ success: false, error: "Workspace not found" }, 404);
  }

  const plugins = WorkspaceService.listWorkspacePlugins(id);
  const { listDockPins } = await import("../workspace/workspaces");
  return c.json({ success: true, count: plugins.length, data: plugins, pinned: listDockPins(id) });
});

/**
 * POST /api/workspaces/:id/pins - Records a dock pin server-side
 * { id }. The palette keeps its instant local pin; this is the durable
 * record shared with the agent, CLI and routes.
 */
workspacesRouter.post("/:id/pins", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const itemId = (body as any)?.id;
  if (typeof itemId !== "string" || !itemId) {
    return c.json({ success: false, error: "Pin needs { id }." }, 400);
  }
  const { pinDockItem, listDockPins } = await import("../workspace/workspaces");
  pinDockItem(c.req.param("id"), itemId);
  return c.json({ success: true, pinned: listDockPins(c.req.param("id")) });
});

/**
 * DELETE /api/workspaces/:id/pins/:itemId - Removes a server dock pin.
 */
workspacesRouter.delete("/:id/pins/:itemId", async (c) => {
  const { unpinDockItem, listDockPins } = await import("../workspace/workspaces");
  unpinDockItem(c.req.param("id"), c.req.param("itemId"));
  return c.json({ success: true, pinned: listDockPins(c.req.param("id")) });
});

/**
 * POST /api/workspaces/:id/plugins - Mounts a plugin into this workspace
 */
workspacesRouter.post("/:id/plugins", async (c) => {
  const id = c.req.param("id");
  const ws = WorkspaceService.getWorkspace(id);
  if (!ws) {
    return c.json({ success: false, error: "Workspace not found" }, 404);
  }

  try {
    const body = await c.req.json();
    if (!body || typeof body.pluginId !== "string") {
      return c.json({ success: false, error: "pluginId is required" }, 400);
    }

    const mounted = WorkspaceService.addPluginToWorkspace(
      id,
      body.pluginId,
      body.settings || {},
      body.position || 0,
      "user"
    );

    return c.json({ success: true, data: mounted }, 201);
  } catch (err: any) {
    return c.json({ success: false, error: err.message || "Failed to mount plugin" }, 500);
  }
});

/**
 * PATCH /api/workspaces/:id/plugins/:pluginId - Toggles plugin status in this workspace
 */
workspacesRouter.patch("/:id/plugins/:pluginId", async (c) => {
  const id = c.req.param("id");
  const pluginId = c.req.param("pluginId");
  try {
    const body = await c.req.json();
    const enabled = Boolean(body.enabled);
    const updated = WorkspaceService.setWorkspacePluginStatus(id, pluginId, enabled, "user");
    if (!updated) {
      return c.json({ success: false, error: "Plugin not found in workspace" }, 404);
    }
    return c.json({ success: true, enabled });
  } catch (err: any) {
    return c.json({ success: false, error: err.message || "Failed to update plugin status" }, 500);
  }
});

/**
 * DELETE /api/workspaces/:id/plugins/:pluginId - Unmounts a plugin from this workspace
 */
workspacesRouter.delete("/:id/plugins/:pluginId", (c) => {
  const id = c.req.param("id");
  const pluginId = c.req.param("pluginId");
  const removed = WorkspaceService.removePluginFromWorkspace(id, pluginId, "user");
  if (!removed) {
    return c.json({ success: false, error: "Plugin was not mounted in this workspace" }, 404);
  }
  return c.json({ success: true });
});

/**
 * GET /api/workspaces/:id/plugins/:pluginId/srcdoc - Serves sandboxed HTML payload for workspace plugin
 */
workspacesRouter.get("/:id/plugins/:pluginId/srcdoc", async (c) => {
  const id = c.req.param("id");
  const pluginId = c.req.param("pluginId");
  try {
    let feat = await readFeature(id, pluginId);
    if (!feat && id !== "default") {
      feat = await readFeature("default", pluginId);
    }
    if (!feat) {
      feat = await readFeature("global", pluginId);
    }
    c.header("Content-Type", "text/html; charset=utf-8");
    return c.body(feat.srcdoc);
  } catch {
    return c.text("Dynamic plugin not found", 404);
  }
});
