import { Hono } from "hono";
import {
  listRegistryPlugins,
  getRegistryPlugin,
  publishToRegistry,
  installFromRegistry,
} from "../plugins/communityRegistry";

export const registryRouter = new Hono();

/**
 * GET /api/registry - Lists all plugins in the community registry
 */
registryRouter.get("/", (c) => {
  const search = c.req.query("search");
  const tag = c.req.query("tag");
  const plugins = listRegistryPlugins({ search, tag });
  return c.json({ success: true, count: plugins.length, data: plugins });
});

/**
 * GET /api/registry/:id - Retrieves details of a specific registry plugin
 */
registryRouter.get("/:id", (c) => {
  const id = c.req.param("id");
  const plugin = getRegistryPlugin(id);
  if (!plugin) {
    return c.json({ success: false, error: "Registry plugin not found" }, 404);
  }
  return c.json({ success: true, data: plugin });
});

/**
 * POST /api/registry/publish - Publishes a workspace plugin to the community registry
 */
registryRouter.post("/publish", async (c) => {
  try {
    const body = await c.req.json();
    if (!body || typeof body.pluginId !== "string") {
      return c.json({ success: false, error: "pluginId is required" }, 400);
    }

    const result = await publishToRegistry({
      pluginId: body.pluginId,
      workspaceId: body.workspaceId || "default",
      author: body.author,
      tags: body.tags,
    });

    if (!result.success) {
      return c.json({ success: false, error: result.error || "Failed to publish plugin" }, 400);
    }

    return c.json({ success: true, data: result.item }, 201);
  } catch (err: any) {
    return c.json({ success: false, error: err.message || "Publishing failed" }, 500);
  }
});

/**
 * POST /api/registry/:id/install - Installs a registry plugin into a target workspace
 */
registryRouter.post("/:id/install", async (c) => {
  const id = c.req.param("id");
  try {
    const body = await c.req.json().catch(() => ({}));
    const workspaceId = body.workspaceId || "default";

    const result = await installFromRegistry(id, workspaceId);
    if (!result.success) {
      return c.json({ success: false, error: result.error || "Installation failed" }, 400);
    }

    return c.json({
      success: true,
      message: `Plugin "${id}" installed to workspace "${workspaceId}".`,
      data: result.plugin,
    });
  } catch (err: any) {
    return c.json({ success: false, error: err.message || "Failed to install plugin" }, 500);
  }
});
