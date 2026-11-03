import { Hono } from "hono";
import { pluginRegistry } from "../plugins/registry";
import { capabilityBus } from "../plugins/bus";
import { approvalManager, type ApprovalDecision } from "../plugins/approval";
import { connectMcpServer } from "../plugins/adapters/mcp";
import { denyUnlessWorkspace } from "../auth/guard";
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
      active: p.enabled,
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
 * POST /api/plugins/:id/activate - Enable a plugin (persisted; capabilities
 * return to the agent catalog, stored data untouched).
 */
pluginsRouter.post("/:id/activate", async (c) => {
  const { pluginSetActive } = await import("../facade/shared");
  const out = await pluginSetActive(c.req.param("id"), true, { actor: "user" });
  if (!out.ok) {
    return c.json({ error: out.error, code: out.code }, out.code === "not_found" ? 404 : 400);
  }
  return c.json({ success: true, ...(out.data as Record<string, unknown>) });
});

/**
 * POST /api/plugins/:id/deactivate - Disable a plugin (persisted; its
 * capabilities leave the agent catalog, stored data kept for reactivation).
 */
pluginsRouter.post("/:id/deactivate", async (c) => {
  const { pluginSetActive } = await import("../facade/shared");
  const out = await pluginSetActive(c.req.param("id"), false, { actor: "user" });
  if (!out.ok) {
    return c.json({ error: out.error, code: out.code }, out.code === "not_found" ? 404 : 400);
  }
  return c.json({ success: true, ...(out.data as Record<string, unknown>) });
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
 * GET /api/plugins/:id/grants - granted permissions, visible and revocable (#180).
 */
pluginsRouter.get("/:id/grants", (c) => {
  const grants = pluginRegistry.getGrants(c.req.param("id"));
  return c.json({ pluginId: c.req.param("id"), grants });
});

/**
 * POST /api/plugins/grants/:grantId/revoke - revoke one grant.
 * Uninstall removes all of a plugin's grants; this is the per-permission path.
 */
pluginsRouter.post("/grants/:grantId/revoke", (c) => {
  const ok = pluginRegistry.revokeGrant(c.req.param("grantId"));
  if (!ok) return c.json({ error: "Grant not found.", code: "not_found" }, 404);
  return c.json({ success: true, grantId: c.req.param("grantId"), revoked: true });
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
  const { name, url, token, transport, headers, command, args, allowStdio } = body;
  if (!name || typeof name !== "string") {
    return c.json({ error: "Field 'name' is required." }, 400);
  }
  if (!url && !command) {
    return c.json({ error: "Either 'url' (streamable/sse) or 'command' (stdio) is required." }, 400);
  }

  // Install policy: connecting an external MCP server registers a new
  // trust:external plugin. It requires explicit confirmation in the body
  // (the UI sends confirmed:true after the user approves the dialog);
  // policy=never always denies.
  const { config } = await import("../config");
  if (config.INSTALL_POLICY === "never") {
    return c.json({ ok: false, error: "Install policy is 'never': MCP connect is disabled.", retryable: false, code: "install_denied" }, 400);
  }
  if (config.INSTALL_POLICY !== "auto" && (body as any)?.confirmed !== true) {
    return c.json({ ok: false, error: "MCP connect needs explicit user confirmation: retry with { confirmed: true }.", retryable: false, code: "approval_required" }, 400);
  }

  let parsedUrl: URL | null = null;
  if (url) {
    try {
      parsedUrl = new URL(url);
    } catch {
      return c.json({ error: "Invalid MCP server URL." }, 400);
    }
  }

  const cleanId = `mcp_${name.toLowerCase().replace(/[^a-z0-9_-]/g, "_")}`;

  // Try dynamic tool discovery via the shared MCP client manager
  // (Streamable HTTP first, SSE fallback, stdio gated).
  let discoveredTools: any[] = [];
  let discoveryWarning: string | null = null;
  try {
    const discovery = await connectMcpServer({
      name,
      url,
      token,
      transport: transport || (url ? "streamable" : "stdio"),
      headers,
      command,
      args,
      allowStdio,
    });
    if (discovery.success && discovery.tools && discovery.tools.length > 0) {
      discoveredTools = discovery.tools;
    } else {
      discoveryWarning = discovery.error || "Live tool discovery returned nothing; installed a generic invoke action instead.";
    }
  } catch {
    // Server might be offline during connect; fall back to a generic action
    // but say so explicitly instead of pretending discovery succeeded.
    discoveryWarning = "Live tool discovery failed (server unreachable); installed a generic invoke action instead.";
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
    description: `External MCP server at ${parsedUrl ? parsedUrl.hostname : command}`,
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
      ...(parsedUrl
        ? [
            {
              type: "net",
              hosts: [parsedUrl.hostname],
            },
          ]
        : []),
      {
        type: "mcp",
        server: url || command,
      },
      ...(token
        ? [{ type: "secret" as const, name: `MCP_TOKEN_${cleanId.toUpperCase()}` }]
        : []),
    ],
  });

  if (!installed.success || !installed.plugin) {
    return c.json({ error: installed.error || "Failed to install MCP plugin." }, 400);
  }

  return c.json({
    success: true,
    plugin: installed.plugin,
    ...(discoveryWarning ? { discoveryWarning } : {}),
  }, 201);
});

/**
 * GET /api/plugins/mcp/servers - connected MCP servers with tool counts.
 */
pluginsRouter.get("/mcp/servers", async (c) => {
  const { McpClientManager } = await import("../mcp/manager");
  return c.json({ servers: McpClientManager.getInstance().listServers() });
});

/**
 * POST /api/plugins/mcp/refresh - re-list tools (list_changed refresh).
 */
pluginsRouter.post("/mcp/refresh", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { name } = body;
  if (!name || typeof name !== "string") {
    return c.json({ error: "Field 'name' is required." }, 400);
  }
  try {
    const { McpClientManager } = await import("../mcp/manager");
    const tools = await McpClientManager.getInstance().refreshTools(name);
    return c.json({ success: true, tools });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
});

/**
 * POST /api/plugins/mcp/search - progressive discovery over connected tools.
 */
pluginsRouter.post("/mcp/search", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { query, limit, server } = body;
  const { McpClientManager } = await import("../mcp/manager");
  const results = McpClientManager.getInstance().searchTools(
    typeof query === "string" ? query : "",
    typeof limit === "number" ? limit : 10,
    typeof server === "string" ? server : undefined
  );
  return c.json({ query: query || "", found: results.length, tools: results });
});

/**
 * POST /api/plugins/mcp/disconnect - close a connection and uninstall its plugin.
 */
pluginsRouter.post("/mcp/disconnect", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { name, keepPlugin } = body;
  if (!name || typeof name !== "string") {
    return c.json({ error: "Field 'name' is required." }, 400);
  }
  const { McpClientManager } = await import("../mcp/manager");
  await McpClientManager.getInstance().disconnect(name);
  if (!keepPlugin) {
    const cleanId = `mcp_${name.toLowerCase().replace(/[^a-z0-9_-]/g, "_")}`;
    pluginRegistry.uninstall(cleanId);
  }
  return c.json({ success: true, name });
});
/**
 * POST /api/plugins/lifecycle - Plugin synthesis lifecycle
 * { op: create|modify|publish|install, ...params }.
 * Registered BEFORE the two-parameter route below so the literal wins.
 */
pluginsRouter.post("/lifecycle", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { op, ...params } = body ?? {};
  const workspaceId = (body as any)?.workspaceId || c.req.query("workspaceId");
  const stop = await denyUnlessWorkspace(c, workspaceId);
  if (stop) return stop;
  const { pluginLifecycle } = await import("../facade/shared");
  const out = await pluginLifecycle(typeof op === "string" ? op : "", params ?? {}, {
    actor: "user",
    workspaceId,
  });
  if (!out.ok) return c.json(out, 400);
  return c.json(out);
});

/**
 * GET /api/plugins/:id/versions - Kept versions of a plugin (edit history).
 */
pluginsRouter.get("/:id/versions", async (c) => {
  const { pluginVersions } = await import("../facade/shared");
  const out = await pluginVersions(c.req.param("id"));
  if (!out.ok) return c.json(out, 400);
  return c.json(out);
});

/**
 * POST /api/plugins/:id/rollback - Roll back to a kept version { version }.
 * Workspace plugins append a new version row with the old content;
 * registry-tracked ones reactivate via the versions table.
 */
pluginsRouter.post("/:id/rollback", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const workspaceId = (body as any)?.workspaceId || c.req.query("workspaceId");
  const stop = await denyUnlessWorkspace(c, workspaceId);
  if (stop) return stop;
  const { pluginRollback } = await import("../facade/shared");
  const out = await pluginRollback(c.req.param("id"), (body as any)?.version, workspaceId);
  if (!out.ok) {
    const status = (out as any).code === "not_found" ? 404 : 400;
    return c.json(out, status as any);
  }
  return c.json(out);
});

/**
 * POST /api/plugins/:pluginId/:capability - Invoke a contract capability.
 * Generated surface: every defineCapability registration is invocable
 * here with the same envelope the agent and CLI receive.
 * Registered AFTER all specific POST routes: Hono matches routes in
 * registration order, so this two-parameter route must not shadow
 * literals like /mcp/connect.
 */
pluginsRouter.post("/:pluginId/:capability", async (c) => {
  const pluginId = c.req.param("pluginId");
  const capability = c.req.param("capability");
  const body = await c.req.json().catch(() => ({}));
  const input = (body && typeof body === "object" && "input" in (body as any) ? (body as any).input : body) ?? {};
  const workspaceId =
    (body && typeof body === "object" && typeof (body as any).workspaceId === "string"
      ? (body as any).workspaceId

      : undefined) ??
    (input && typeof input === "object" && typeof (input as any).workspaceId === "string"
      ? (input as any).workspaceId
      : undefined) ??
    c.req.query("workspaceId");
  const { invokeCapability } = await import("../facade/shared");
  // Ownership runs through the central guard: owned workspaces isolate
  // over HTTP; unowned device-local ones keep today's open behavior.
  // The agent turn path validates the same way in server/index.ts.
  const stop = await denyUnlessWorkspace(c, workspaceId);
  if (stop) return stop;
  const out = await invokeCapability(pluginId, capability, input, { actor: "user", workspaceId });
  if (!out.ok) {
    const status = (out as any).code === "unknown_capability" ? 404 : 400;
    return c.json(out, status as any);
  }
  return c.json(out);
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
  const { capabilityId, input, workspaceId } = body;
  if (!capabilityId) {
    return c.json({ error: "Missing capabilityId" }, 400);
  }

  // Same central guard as the plugin invoke path (see above).
  const effectiveWorkspace =
    (typeof workspaceId === "string" && workspaceId) ||
    (input && typeof input === "object" && typeof (input as any).workspaceId === "string"
      ? (input as any).workspaceId
      : undefined);
  const stop = await denyUnlessWorkspace(c, effectiveWorkspace);
  if (stop) return stop;

  const result = await capabilityBus.invoke(capabilityId, input, {
    actor: "user",
    workspaceId,
  });

  return c.json(result);
});

/**
 * POST /api/capabilities/:id/invoke - Invoke a capability by parameter ID
 */
capabilitiesRouter.post("/:id/invoke", async (c) => {
  const capabilityId = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const { input, workspaceId } = body;

  // Same central guard as above.
  const effectiveWorkspace =
    (typeof workspaceId === "string" && workspaceId) ||
    (input && typeof input === "object" && typeof (input as any).workspaceId === "string"
      ? (input as any).workspaceId
      : undefined);
  const stop = await denyUnlessWorkspace(c, effectiveWorkspace);
  if (stop) return stop;

  const result = await capabilityBus.invoke(capabilityId, input, {
    actor: "user",
    workspaceId,
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
