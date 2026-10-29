import { Hono } from "hono";
import { pluginRegistry } from "../plugins/registry";
import { capabilityBus } from "../plugins/bus";
import { approvalManager, type ApprovalDecision } from "../plugins/approval";
import { connectMcpServer } from "../plugins/adapters/mcp";
import { validateUrlForSsrf } from "../plugins/ssrf";
import { validatePluginManifest } from "../plugins/manifest";
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
 * POST /api/plugins/install-url - Install a plugin from a remote manifest URL
 */
pluginsRouter.post("/install-url", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { url, permissionsConfirmed } = body;
  if (!url || typeof url !== "string") {
    return c.json({ error: "Manifest URL is required." }, 400);
  }

  // 1. SSRF Guard
  const ssrfCheck = validateUrlForSsrf(url);
  if (!ssrfCheck.safe || !ssrfCheck.url) {
    return c.json({ error: `SSRF Guard Blocked: ${ssrfCheck.reason || "Forbidden URL"}` }, 400);
  }

  // 2. Fetch remote manifest
  let rawManifest: unknown;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(ssrfCheck.url.toString(), {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    clearTimeout(timer);

    if (!res.ok) {
      return c.json({ error: `Failed to fetch manifest: HTTP ${res.status} ${res.statusText}` }, 400);
    }
    const text = await res.text();
    if (Buffer.byteLength(text, "utf-8") > 512 * 1024) {
      return c.json({ error: "Manifest payload exceeds maximum allowed size of 512KB" }, 400);
    }
    rawManifest = JSON.parse(text);
  } catch (err: any) {
    return c.json({ error: `Failed to fetch or parse remote manifest: ${err.message}` }, 400);
  }

  // 3. Validate schema
  const validation = validatePluginManifest(rawManifest);
  if (!validation.success || !validation.data) {
    return c.json({ error: `Invalid plugin manifest: ${validation.error}` }, 400);
  }

  const manifest = validation.data;

  // 4. If permissions not yet confirmed by user, prompt with manifest and required permissions
  if (!permissionsConfirmed) {
    return c.json({
      success: false,
      requiresConfirmation: true,
      manifest,
      permissions: manifest.permissions || [],
    });
  }

  // 5. Install plugin and register capabilities
  const installed = pluginRegistry.install(manifest);
  if (!installed.success || !installed.plugin) {
    return c.json({ error: installed.error || "Failed to install plugin." }, 400);
  }

  // Auto-grant declared permissions upon explicit user confirmation
  for (const perm of manifest.permissions || []) {
    pluginRegistry.recordGrant(manifest.id, perm.type, "*", "allow_always");
  }

  for (const cap of manifest.capabilities || []) {
    capabilityBus.register(manifest.id, cap);
  }

  return c.json({ success: true, plugin: installed.plugin }, 201);
});

/**
 * POST /api/plugins/:pluginId/:capability - Invoke a contract capability.
 * Generated surface: every defineCapability registration is invocable
 * here with the same envelope the agent and CLI receive.
 * Registered AFTER all specific POST routes: Hono matches routes in
 * registration order, so this two-parameter route must not shadow
 * literals like /mcp/connect or /install-url.
 */
pluginsRouter.post("/:pluginId/:capability", async (c) => {
  const { getContractCapability } = await import("../plugins/contract");
  const { capabilityBus } = await import("../plugins/bus");
  const pluginId = c.req.param("pluginId");
  const capability = c.req.param("capability");
  const def = getContractCapability(pluginId, capability);
  if (!def) {
    return c.json({ ok: false, error: `Unknown capability "${pluginId}.${capability}".`, retryable: false }, 404);
  }
  const body = await c.req.json().catch(() => ({}));
  const input = (body && typeof body === "object" && "input" in (body as any) ? (body as any).input : body) ?? {};
  const cityId =
    (body && typeof body === "object" && typeof (body as any).cityId === "string"
      ? (body as any).cityId
      : undefined) ??
    (input && typeof input === "object" && typeof (input as any).cityId === "string"
      ? (input as any).cityId
      : undefined) ??
    c.req.query("cityId");
  const emitted: Array<{ type: string; payload: Record<string, unknown> }> = [];
  const result = await capabilityBus.invoke(`${pluginId}.${capability}`, input, {
    actor: "user",
    cityId,
    onEvent: async (e) => {
      if (e.type !== "tool.start" && e.type !== "tool.done") emitted.push({ type: e.type, payload: e.payload });
    },
  });
  if (!result.success) {
    return c.json({ ok: false, error: result.error || "Capability failed.", retryable: true }, 400);
  }
  const envelope = result.data as any;
  if (envelope && typeof envelope === "object" && "ok" in envelope) {
    return c.json({ ...envelope, events: [...(envelope.events ?? []), ...emitted] });
  }
  return c.json({ ok: true, data: envelope, events: emitted });
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

/**
 * POST /api/capabilities/:id/invoke - Invoke a capability by parameter ID
 */
capabilitiesRouter.post("/:id/invoke", async (c) => {
  const capabilityId = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const { input, cityId } = body;

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
