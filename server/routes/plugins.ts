import { Hono } from "hono";
import { pluginRegistry } from "../plugins/registry";
import { capabilityBus } from "../plugins/bus";

export const pluginsRouter = new Hono();

/**
 * GET /api/plugins - List all registered plugins and their status
 */
pluginsRouter.get("/", (c) => {
  const enabledOnly = c.req.query("enabled") === "true";
  const plugins = pluginRegistry.list({ enabledOnly });
  return c.json({
    plugins: plugins.map((p) => ({
      id: p.id,
      name: p.name,
      version: p.version,
      description: p.manifest.description,
      icon: p.manifest.icon,
      trust: p.trust,
      enabled: p.enabled,
      capabilitiesCount: p.manifest.capabilities?.length || 0,
      surfaces: p.manifest.surfaces || [],
      permissions: p.manifest.permissions || [],
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    })),
  });
});

/**
 * GET /api/capabilities - Unified capability catalog
 */
pluginsRouter.get("/capabilities", (c) => {
  const enabledOnly = c.req.query("enabled") !== "false";
  const capabilities = capabilityBus.getCapabilities({ enabledOnly });

  return c.json({
    capabilities: capabilities.map((cap) => ({
      id: cap.id,
      pluginId: cap.pluginId,
      title: cap.title,
      description: cap.description,
      risk: cap.risk,
      inputSchema: cap.inputSchema,
      outputSchema: cap.outputSchema,
    })),
  });
});
