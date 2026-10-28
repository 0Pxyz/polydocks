import { Hono } from "hono";
import {
  listWorkspaces,
  getWorkspace,
  createWorkspace,
  updateWorkspace,
  deleteWorkspace,
  listWorkspacePlugins,
  addPluginToWorkspace,
  removePluginFromWorkspace,
  setWorkspacePluginStatus,
} from "../workspace/workspaces";

export const workspacesRouter = new Hono();

/**
 * GET /api/workspaces - Lists all workspaces
 */
workspacesRouter.get("/", (c) => {
  const workspaces = listWorkspaces();
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

    const ws = createWorkspace({
      id: body.id,
      name: body.name,
      description: body.description,
      icon: body.icon,
      isDefault: body.isDefault,
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
  const ws = getWorkspace(id);
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
    const updated = updateWorkspace(id, {
      name: body.name,
      description: body.description,
      icon: body.icon,
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
  const result = deleteWorkspace(id);
  if (!result.success) {
    return c.json({ success: false, error: result.error || "Cannot delete workspace" }, 400);
  }
  return c.json({ success: true });
});

/**
 * GET /api/workspaces/:id/plugins - Lists plugins mounted in this workspace
 */
workspacesRouter.get("/:id/plugins", (c) => {
  const id = c.req.param("id");
  const ws = getWorkspace(id);
  if (!ws) {
    return c.json({ success: false, error: "Workspace not found" }, 404);
  }

  const plugins = listWorkspacePlugins(id);
  return c.json({ success: true, count: plugins.length, data: plugins });
});

/**
 * POST /api/workspaces/:id/plugins - Mounts a plugin into this workspace
 */
workspacesRouter.post("/:id/plugins", async (c) => {
  const id = c.req.param("id");
  const ws = getWorkspace(id);
  if (!ws) {
    return c.json({ success: false, error: "Workspace not found" }, 404);
  }

  try {
    const body = await c.req.json();
    if (!body || typeof body.pluginId !== "string") {
      return c.json({ success: false, error: "pluginId is required" }, 400);
    }

    const mounted = addPluginToWorkspace(
      id,
      body.pluginId,
      body.settings || {},
      body.position || 0
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
    const updated = setWorkspacePluginStatus(id, pluginId, enabled);
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
  const removed = removePluginFromWorkspace(id, pluginId);
  if (!removed) {
    return c.json({ success: false, error: "Plugin was not mounted in this workspace" }, 404);
  }
  return c.json({ success: true });
});
