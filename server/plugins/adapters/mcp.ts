import type { ExecutionContext } from "../bus";
import { pluginRegistry } from "../registry";
import { capabilityBus } from "../bus";
import type { CapabilityManifest, PluginManifest } from "../manifest";
import { type McpAdapterConfig, McpAdapterConfigSchema } from "./types";
import { McpClientManager } from "../../mcp/manager";
import { cleanServerName } from "../../mcp/config";

export interface ConnectMcpServerOptions {
  name: string;
  url?: string;
  token?: string;
  transport?: "http" | "sse" | "stdio" | "streamable";
  command?: string;
  args?: string[];
  headers?: Record<string, string>;
  allowStdio?: boolean;
}

export interface McpToolDefinition {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

function manager(): McpClientManager {
  return McpClientManager.getInstance();
}

/**
 * Connect to an external MCP server, discover its tools, map them to first-class capabilities
 * on the bus with risk 'external', and install the corresponding plugin.
 * Transport order: streamable -> sse fallback; stdio only with explicit opt-in.
 */
export async function connectMcpServer(options: ConnectMcpServerOptions): Promise<{
  success: boolean;
  plugin?: PluginManifest;
  tools: McpToolDefinition[];
  error?: string;
}> {
  const cleanServerNameValue = cleanServerName(options.name);
  const pluginId = `mcp_${cleanServerNameValue}`;

  if (options.transport === "stdio" && !options.allowStdio && process.env.MCP_ALLOW_STDIO !== "1") {
    return {
      success: false,
      tools: [],
      error: "Stdio transport for MCP is disabled for security unless explicitly enabled via allowStdio.",
    };
  }

  const transport = options.transport === "http" ? "streamable" : options.transport || "streamable";

  let tools: McpToolDefinition[] = [];
  try {
    const connected = await manager().connect({
      name: cleanServerNameValue,
      url: options.url,
      transport: transport as "streamable" | "sse" | "stdio",
      token: options.token,
      command: options.command,
      args: options.args || [],
      headers: options.headers || {},
    });
    tools = connected.tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));
  } catch (err: unknown) {
    return {
      success: false,
      tools: [],
      error: `Failed to discover MCP tools from ${options.url || options.command}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  let parsedHost: string | undefined;
  if (options.url) {
    try {
      parsedHost = new URL(options.url).hostname;
    } catch {
      // Ignore
    }
  }

  const capabilities: CapabilityManifest[] = tools.map((t) => ({
    id: `mcp.${cleanServerNameValue}.${t.name}`,
    title: `${options.name}: ${t.name}`,
    description: t.description || `Tool "${t.name}" on remote MCP server "${options.name}"`,
    risk: "external" as const,
    input: t.inputSchema || { type: "object", properties: {} },
    adapter: {
      mcp: {
        server: cleanServerNameValue,
        serverUrl: options.url,
        tool: t.name,
        transport,
        allowStdio: options.allowStdio ?? false,
        token: options.token,
      },
    },
  }));

  const manifest: PluginManifest = {
    apiVersion: 1,
    id: pluginId,
    name: `${options.name} (MCP)`,
    version: "1.0.0",
    description: `External MCP server at ${options.url || options.command} exporting ${tools.length} tool(s).`,
    icon: "PlugsConnected",
    trust: "external",
    capabilities,
    permissions: [
      ...(parsedHost ? [{ type: "net" as const, hosts: [parsedHost] }] : []),
      { type: "mcp" as const, server: options.url || options.command || cleanServerNameValue },
      ...(options.token
        ? [{ type: "secret" as const, name: `MCP_TOKEN_${cleanServerNameValue.toUpperCase()}` }]
        : []),
    ],
  };

  const installResult = pluginRegistry.install(manifest);
  if (!installResult.success || !installResult.plugin) {
    return {
      success: false,
      tools,
      error: installResult.error || "Failed to install MCP plugin in registry.",
    };
  }

  for (const cap of capabilities) {
    capabilityBus.register(pluginId, cap);
  }

  return {
    success: true,
    plugin: manifest,
    tools,
  };
}

/**
 * Declarative MCP capability executor via the shared client manager.
 * Lazily reconnects from the adapter config when the process restarted
 * after the original connect (connections are in-memory).
 */
export async function executeMcpAdapter(
  rawConfig: unknown,
  input: unknown,
  ctx: ExecutionContext
): Promise<unknown> {
  let normalizedConfig: McpAdapterConfig;

  if (typeof rawConfig === "string") {
    normalizedConfig = {
      serverUrl: rawConfig,
      transport: "streamable",
      allowStdio: false,
    };
  } else {
    const parseResult = McpAdapterConfigSchema.safeParse(rawConfig);
    if (!parseResult.success) {
      throw new Error(`Invalid MCP adapter configuration: ${parseResult.error.message}`);
    }
    normalizedConfig = parseResult.data;
  }

  if (normalizedConfig.transport === "stdio" && !normalizedConfig.allowStdio) {
    throw new Error(
      "Stdio transport for MCP is disabled for security unless explicitly enabled via allowStdio."
    );
  }

  const toolName = normalizedConfig.tool;
  if (!toolName) {
    throw new Error("MCP tool name is required for capability invocation.");
  }

  const serverKey = cleanServerName(normalizedConfig.server || "remote");
  const token =
    normalizedConfig.token ||
    (normalizedConfig.server
      ? ctx.secrets?.get(`MCP_TOKEN_${normalizedConfig.server.toUpperCase()}`)
      : undefined);

  const mgr = manager();
  if (!mgr.isConnected(serverKey)) {
    if (!normalizedConfig.serverUrl && normalizedConfig.transport !== "stdio") {
      throw new Error(`MCP server "${serverKey}" is not connected and no URL is stored to reconnect.`);
    }
    await mgr.connect({
      name: serverKey,
      url: normalizedConfig.serverUrl,
      transport:
        normalizedConfig.transport === "http" ? "streamable" : (normalizedConfig.transport as "streamable" | "sse" | "stdio"),
      token,
      command: normalizedConfig.command,
      args: normalizedConfig.args || [],
    });
  }

  const args = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const res = await mgr.callTool(serverKey, toolName, args);
  return res.content;
}
