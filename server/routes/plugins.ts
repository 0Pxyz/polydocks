import { Hono } from "hono";
import { pluginRegistry } from "../plugins/registry";
import { capabilityBus } from "../plugins/bus";
import { approvalManager, type ApprovalDecision } from "../plugins/approval";
import { connectMcpServer } from "../plugins/adapters/mcp";
import { db } from "../workspace/db";

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
 * POST /api/plugins/:id/toggle - Toggle plugin enabled state
 */
pluginsRouter.post("/:id/toggle", (c) => {
  const id = c.req.param("id");
  const plugin = pluginRegistry.get(id);
  if (!plugin) {
    return c.json({ error: "Plugin not found" }, 404);
  }

  if (plugin.enabled) {
    pluginRegistry.disable(id);
  } else {
    pluginRegistry.enable(id);
  }

  const updated = pluginRegistry.get(id);
  return c.json({ success: true, id, enabled: updated?.enabled });
});

/**
 * DELETE /api/plugins/:id - Uninstall an external/generated plugin
 */
pluginsRouter.delete("/:id", (c) => {
  const id = c.req.param("id");
  const plugin = pluginRegistry.get(id);
  if (!plugin) {
    return c.json({ error: "Plugin not found" }, 404);
  }

  if (plugin.trust === "core") {
    return c.json({ error: "Cannot uninstall core system plugins." }, 400);
  }

  const ok = pluginRegistry.uninstall(id);
  return c.json({ success: ok, id });
});

/**
 * GET /api/plugins/:id/executions - Get recent executions for status dots
 */
pluginsRouter.get("/:id/executions", (c) => {
  const id = c.req.param("id");
  const limit = Math.min(Number.parseInt(c.req.query("limit") || "5", 10), 50);

  const rows = db
    .query<
      {
        execution_id: string;
        capability_id: string;
        status: string;
        duration_ms: number;
        error: string | null;
        created_at: string;
      },
      [string, number]
    >(
      `SELECT execution_id, capability_id, status, duration_ms, error, created_at 
       FROM executions WHERE plugin_id = ? 
       ORDER BY created_at DESC LIMIT ?`
    )
    .all(id, limit);

  return c.json({
    executions: rows.map((r) => ({
      executionId: r.execution_id,
      capabilityId: r.capability_id,
      status: r.status,
      durationMs: r.duration_ms,
      error: r.error,
      createdAt: r.created_at,
    })),
  });
});

/**
 * POST /api/plugins/mcp/connect - Connect an external MCP server
 */
pluginsRouter.post("/mcp/connect", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { name, url, token } = body;
  if (!name || typeof name !== "string" || !url || typeof url !== "string") {
    return c.json({ error: "Both name and url are required." }, 400);
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return c.json({ error: "Invalid MCP server URL." }, 400);
  }

  const cleanId = `mcp_${name.toLowerCase().replace(/[^a-z0-9_-]/g, "_")}`;

  // Try dynamic tool discovery via MCP adapter
  let discoveredTools: any[] = [];
  try {
    const discovery = await connectMcpServer({ name, url, token });
    if (discovery.success && discovery.tools && discovery.tools.length > 0) {
      discoveredTools = discovery.tools;
    }
  } catch {
    // Server might be offline or mock during connect; fallback gracefully
  }

  if (discoveredTools.length > 0) {
    const installed = pluginRegistry.get(cleanId);
    return c.json({ success: true, plugin: installed, tools: discoveredTools }, 201);
  }

  const installed = pluginRegistry.install({
    apiVersion: 1,
    id: cleanId,
    name: name.trim(),
    version: "1.0.0",
    description: `External MCP server at ${parsedUrl.hostname}`,
    icon: "PlugsConnected",
    trust: "external",
    capabilities: [
      {
        id: `${cleanId}.invoke`,
        title: `${name} Action`,
        description: `Invoke capability on external MCP server ${name}`,
        risk: "external",
        adapter: {
          mcp: url,
        },
        input: {
          type: "object",
          properties: {
            tool: { type: "string" },
            arguments: { type: "object" },
          },
          required: ["tool"],
        },
      },
    ],
    permissions: [
      {
        type: "net",
        hosts: [parsedUrl.hostname],
      },
      {
        type: "mcp",
        server: url,
      },
      ...(token
        ? [{ type: "secret" as const, name: `MCP_TOKEN_${cleanId.toUpperCase()}` }]
        : []),
    ],
  });

  if (!installed.success || !installed.plugin) {
    return c.json({ error: installed.error || "Failed to install MCP plugin." }, 400);
  }

  return c.json({ success: true, plugin: installed.plugin }, 201);
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

/**
 * POST /api/capabilities/invoke - Invoke a capability
 */
capabilitiesRouter.post("/invoke", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { capabilityId, input, cityId } = body;
  if (!capabilityId) {
    return c.json({ error: "Missing capabilityId" }, 400);
  }

  const result = await capabilityBus.invoke(capabilityId, input, {
    actor: "user",
    cityId,
  });

  return c.json(result);
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
