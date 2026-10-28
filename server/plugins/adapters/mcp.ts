import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { ExecutionContext } from "../bus";
import { pluginRegistry } from "../registry";
import { capabilityBus } from "../bus";
import type { CapabilityManifest, PluginManifest } from "../manifest";
import { type McpAdapterConfig, McpAdapterConfigSchema } from "./types";

export interface ConnectMcpServerOptions {
  name: string;
  url?: string;
  token?: string;
  transport?: "http" | "sse" | "stdio";
  command?: string;
  args?: string[];
  allowStdio?: boolean;
}

export interface McpToolDefinition {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

/**
 * Fetch remote tools via HTTP JSON-RPC 2.0 POST.
 */
async function fetchToolsHttp(
  url: string,
  token?: string,
  fetchFn: typeof fetch = fetch
): Promise<McpToolDefinition[]> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetchFn(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "tools_list",
      method: "tools/list",
      params: {},
    }),
  });

  if (!response.ok) {
    throw new Error(`MCP HTTP tools/list failed with status ${response.status} (${response.statusText})`);
  }

  const json = (await response.json()) as any;
  if (json.error) {
    throw new Error(`MCP tools/list error: ${json.error.message || JSON.stringify(json.error)}`);
  }

  const tools = json.result?.tools;
  if (!Array.isArray(tools)) {
    return [];
  }

  return tools.map((t: any) => ({
    name: String(t.name),
    description: t.description ? String(t.description) : undefined,
    inputSchema: t.inputSchema || { type: "object", properties: {} },
  }));
}

/**
 * Fetch remote tools via official TypeScript MCP SDK Client with SSE or Stdio transport.
 */
async function fetchToolsSdk(options: ConnectMcpServerOptions): Promise<McpToolDefinition[]> {
  const client = new Client(
    { name: "polymax-client", version: "1.0.0" },
    { capabilities: {} }
  );

  let transport: SSEClientTransport | StdioClientTransport;

  if (options.transport === "stdio") {
    if (!options.allowStdio) {
      throw new Error(
        "Stdio transport for MCP is disabled for security unless explicitly enabled via allowStdio."
      );
    }
    if (!options.command) {
      throw new Error("Command is required for stdio transport.");
    }
    transport = new StdioClientTransport({
      command: options.command,
      args: options.args || [],
    });
  } else {
    if (!options.url) {
      throw new Error("URL is required for SSE transport.");
    }
    const headers: Record<string, string> = {};
    if (options.token) {
      headers.Authorization = `Bearer ${options.token}`;
    }
    transport = new SSEClientTransport(new URL(options.url), {
      eventSourceInit: {
        // @ts-expect-error headers may be supported by underlying fetch
        headers,
      },
      requestInit: {
        headers,
      },
    });
  }

  try {
    await client.connect(transport);
    const result = await client.listTools();
    const tools = (result?.tools || []).map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema as Record<string, unknown>,
    }));
    return tools;
  } finally {
    try {
      await client.close();
    } catch {
      // Ignore cleanup error
    }
  }
}

/**
 * Connect to an external MCP server, discover its tools, map them to first-class capabilities
 * on the bus with risk 'external', and install the corresponding plugin.
 */
export async function connectMcpServer(options: ConnectMcpServerOptions): Promise<{
  success: boolean;
  plugin?: PluginManifest;
  tools: McpToolDefinition[];
  error?: string;
}> {
  const cleanServerName = options.name.toLowerCase().replace(/[^a-z0-9_-]/g, "_");
  const pluginId = `mcp_${cleanServerName}`;

  if (options.transport === "stdio" && !options.allowStdio) {
    return {
      success: false,
      tools: [],
      error: "Stdio transport for MCP is disabled for security unless explicitly enabled via allowStdio.",
    };
  }

  let tools: McpToolDefinition[] = [];
  try {
    if (options.transport === "stdio") {
      tools = await fetchToolsSdk(options);
    } else if (options.url) {
      // Attempt SSE first; if that fails, try HTTP JSON-RPC
      try {
        if (options.transport === "sse") {
          tools = await fetchToolsSdk(options);
        } else {
          tools = await fetchToolsHttp(options.url, options.token);
        }
      } catch (firstErr) {
        // Fallback between HTTP and SSE
        try {
          if (options.transport === "sse") {
            tools = await fetchToolsHttp(options.url, options.token);
          } else {
            tools = await fetchToolsSdk(options);
          }
        } catch {
          // If discovery fails, continue with fallback error or rethrow
          throw firstErr;
        }
      }
    }
  } catch (err: any) {
    return {
      success: false,
      tools: [],
      error: `Failed to discover MCP tools from ${options.url || options.command}: ${err.message}`,
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

  // Map remote tools into local capabilities: mcp.<server>.<tool> with external risk
  const capabilities: CapabilityManifest[] = tools.map((t) => ({
    id: `mcp.${cleanServerName}.${t.name}`,
    title: `${options.name}: ${t.name}`,
    description: t.description || `Tool "${t.name}" on remote MCP server "${options.name}"`,
    risk: "external" as const, // Sets default risk to external (prompts on first use)
    input: t.inputSchema || { type: "object", properties: {} },
    adapter: {
      mcp: {
        server: cleanServerName,
        serverUrl: options.url,
        tool: t.name,
        transport: options.transport || "http",
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
      { type: "mcp" as const, server: options.url || options.command || cleanServerName },
      ...(options.token
        ? [{ type: "secret" as const, name: `MCP_TOKEN_${cleanServerName.toUpperCase()}` }]
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

  // Register capabilities on the bus
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
 * Declarative MCP capability executor.
 * Dispatches tool execution to the remote MCP server via HTTP JSON-RPC or SDK client.
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
      transport: "http",
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

  const token =
    normalizedConfig.token ||
    (normalizedConfig.server
      ? ctx.secrets?.get(`MCP_TOKEN_${normalizedConfig.server.toUpperCase()}`)
      : undefined);

  // If HTTP URL is provided, invoke via JSON-RPC 2.0 tools/call
  if (normalizedConfig.serverUrl) {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const fetchFn = ctx.fetch || fetch;
    const response = await fetchFn(normalizedConfig.serverUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: `call_${Date.now()}`,
        method: "tools/call",
        params: {
          name: toolName,
          arguments: input && typeof input === "object" ? input : {},
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(
        `MCP tools/call failed with status ${response.status} (${response.statusText}): ${errText.slice(0, 500)}`
      );
    }

    const json = (await response.json()) as any;
    if (json.error) {
      throw new Error(`MCP tool error: ${json.error.message || JSON.stringify(json.error)}`);
    }

    return json.result?.content ?? json.result;
  }

  // If stdio transport
  if (normalizedConfig.transport === "stdio") {
    if (!normalizedConfig.command) {
      throw new Error("Command is required for stdio MCP transport.");
    }

    const client = new Client(
      { name: "polymax-client", version: "1.0.0" },
      { capabilities: {} }
    );
    const transport = new StdioClientTransport({
      command: normalizedConfig.command,
      args: normalizedConfig.args || [],
    });

    try {
      await client.connect(transport);
      const res = await client.callTool({
        name: toolName,
        arguments: input && typeof input === "object" ? (input as Record<string, unknown>) : {},
      });
      return res.content ?? res;
    } finally {
      try {
        await client.close();
      } catch {
        // Ignore cleanup error
      }
    }
  }

  throw new Error("No server URL or command provided for MCP capability execution.");
}
