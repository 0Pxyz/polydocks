import { Hono } from "hono";
import { pluginRegistry } from "../plugins/registry";
import { capabilityBus } from "../plugins/bus";
import { approvalManager, type ApprovalDecision } from "../plugins/approval";

export const pluginsRouter = new Hono();
export const capabilitiesRouter = new Hono();

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
capabilitiesRouter.get("/", (c) => {
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

/**
 * GET /api/capabilities/approvals - List pending approval requests
 */
capabilitiesRouter.get("/approvals", (c) => {
  const approvals = approvalManager.listPending();
  return c.json({ approvals });
});

/**
 * GET /api/capabilities/approvals/:id - Get approval request status
 */
capabilitiesRouter.get("/approvals/:id", (c) => {
  const id = c.req.param("id");
  const approval = approvalManager.get(id);
  if (!approval) {
    return c.json({ error: "Approval request not found" }, 404);
  }
  return c.json({ approval });
});

/**
 * POST /api/capabilities/approvals/:id - Resolve user approval (allow_once, allow_always, deny)
 */
capabilitiesRouter.post("/approvals/:id", async (c) => {
  const id = c.req.param("id");
  let body: { decision?: ApprovalDecision } = {};
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }

  const decision = body.decision;
  if (decision !== "allow_once" && decision !== "allow_always" && decision !== "deny") {
    return c.json(
      { error: "Invalid decision. Must be one of: 'allow_once', 'allow_always', or 'deny'." },
      400
    );
  }

  const resolved = approvalManager.resolveApproval(id, decision);
  if (!resolved) {
    return c.json(
      { error: "Approval request not found or has already been resolved or timed out." },
      404
    );
  }

  return c.json({ success: true, id, decision });
});

// Backward compatibility: keep pluginsRouter.get("/capabilities", ...)
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
