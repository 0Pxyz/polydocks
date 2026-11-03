import { Hono } from "hono";
import { WorkspaceService } from "../services/workspaceService";
import { readFeature } from "../workspace/features";
import { getEffectiveCaller, hasWorkspaceAccess, isWorkspaceOwner } from "../auth/session";
import { addWorkspaceMember, countWorkspaceMembers, removeAllWorkspaceMembers } from "../auth/membership";

export const workspacesRouter = new Hono();

/**
 * Ownership guard. Unowned (legacy/device-local) workspaces stay open to
 * local callers (local-first compat). Owned workspaces require membership.
 * Returns null when access is granted, otherwise a 404/403 response.
 */
async function guard(c: any, id: string) {
  const ws = WorkspaceService.getWorkspace(id);
  if (!ws) return c.json({ success: false, error: "Workspace not found" }, 404);
  const caller = await getEffectiveCaller(c.req.raw.headers);
  if (!hasWorkspaceAccess(id, caller)) {
    return c.json({ success: false, error: "Not available to this account" }, 403);
  }
  return null;
}

/**
 * GET /api/workspaces - Lists workspaces visible to the caller:
 * every device-local (unowned) workspace plus owned workspaces the
 * caller belongs to. Unauthenticated local callers see exactly what
 * they saw before Better Auth existed.
 */
workspacesRouter.get("/", async (c) => {
  const caller = await getEffectiveCaller(c.req.raw.headers);
  const all = WorkspaceService.listWorkspaces();
  const data = all.filter((ws) => hasWorkspaceAccess(ws.id, caller));
  return c.json({ success: true, count: data.length, data });
});

/**
 * POST /api/workspaces - Creates a new workspace. When the caller is
 * signed in, they become its owner (membership row); otherwise the
 * workspace stays device-local, exactly as before.
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

    const caller = await getEffectiveCaller(c.req.raw.headers);
    if (caller.kind === "user") {
      addWorkspaceMember(ws.id, caller.user.id, "owner");
    }

    return c.json({ success: true, data: ws }, 201);
  } catch (err: any) {
    return c.json({ success: false, error: err.message || "Failed to create workspace" }, 500);
  }
});

/**
 * GET /api/workspaces/:id - Retrieves a specific workspace
 */
workspacesRouter.get("/:id", async (c) => {
  const id = c.req.param("id");
  const denied = await guard(c, id);
  if (denied) return denied;
  const ws = WorkspaceService.getWorkspace(id);
  return c.json({ success: true, data: ws });
});

/**
 * PUT /api/workspaces/:id - Updates workspace details (members may edit;
 * device-local keeps the legacy open behavior).
 */
workspacesRouter.put("/:id", async (c) => {
  const id = c.req.param("id");
  const denied = await guard(c, id);
  if (denied) return denied;
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
 * DELETE /api/workspaces/:id - Deletes a workspace. Owned workspaces
 * require the owner role; device-local keeps the legacy behavior
 * (anyone with device access except the default workspace).
 */
workspacesRouter.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const denied = await guard(c, id);
  if (denied) return denied;
  if (countWorkspaceMembers(id) > 0) {
    const caller = await getEffectiveCaller(c.req.raw.headers);
    if (!isWorkspaceOwner(id, caller)) {
      return c.json({ success: false, error: "Only the workspace owner can delete it" }, 403);
    }
  }
  const result = WorkspaceService.deleteWorkspace(id, "user");
  if (!result.success) {
    return c.json({ success: false, error: result.error || "Cannot delete workspace" }, 400);
  }
  removeAllWorkspaceMembers(id);
  return c.json({ success: true });
});

/**
 * GET /api/workspaces/:id/plugins - Lists plugins mounted in this workspace
 */
workspacesRouter.get("/:id/plugins", async (c) => {
  const id = c.req.param("id");
  const denied = await guard(c, id);
  if (denied) return denied;

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
  const denied = await guard(c, c.req.param("id"));
  if (denied) return denied;
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
  const denied = await guard(c, c.req.param("id"));
  if (denied) return denied;
  const { unpinDockItem, listDockPins } = await import("../workspace/workspaces");
  unpinDockItem(c.req.param("id"), c.req.param("itemId"));
  return c.json({ success: true, pinned: listDockPins(c.req.param("id")) });
});

/**
 * POST /api/workspaces/:id/plugins - Mounts a plugin into this workspace
 */
workspacesRouter.post("/:id/plugins", async (c) => {
  const id = c.req.param("id");
  const denied = await guard(c, id);
  if (denied) return denied;

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
  const denied = await guard(c, id);
  if (denied) return denied;
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
workspacesRouter.delete("/:id/plugins/:pluginId", async (c) => {
  const id = c.req.param("id");
  const pluginId = c.req.param("pluginId");
  const denied = await guard(c, id);
  if (denied) return denied;
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
  const denied = await guard(c, id);
  if (denied) return denied;
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
