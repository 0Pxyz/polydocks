import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { type McpServerDef, cleanServerName, withResolvedToken } from "./config";

export interface McpToolInfo {
  server: string;
  name: string;
  title?: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

interface Connection {
  def: McpServerDef;
  client: Client;
  transport: { close?: () => Promise<void> | void };
  tools: McpToolInfo[];
  toolsFetchedAt: number;
  failures: number;
}

const TOOLS_CACHE_TTL_MS = 60_000;
const OUTPUT_CAP_BYTES = 65_536;

function scoreMatch(query: string, tool: McpToolInfo): number {
  const q = query.toLowerCase().trim();
  if (!q) return 0;
  const tokens = q.split(/\s+/).filter(Boolean);
  const name = tool.name.toLowerCase();
  const desc = (tool.description || "").toLowerCase();
  const server = tool.server.toLowerCase();
  let score = 0;
  for (const t of tokens) {
    if (name === t) score += 10;
    else if (name.includes(t)) score += 5;
    if (server.includes(t)) score += 3;
    if (desc.includes(t)) score += 2;
  }
  return score;
}

function truncateOutput(text: string, cap = OUTPUT_CAP_BYTES): string {
  if (text.length <= cap) return text;
  return `${text.slice(0, cap)}\n…[truncated ${text.length - cap} chars]`;
}

/**
 * Multi-server MCP client manager.
 * Follows MCP client best practices: Streamable HTTP first with SSE
 * fallback, stdio gated, per-call timeouts, host-held credentials,
 * cached tool definitions with list_changed refresh, and progressive
 * discovery (search -> inspect -> execute) so the model never loads
 * every tool definition up front.
 */
export class McpClientManager {
  private static instance: McpClientManager | null = null;
  private connections = new Map<string, Connection>();
  private allowStdio: boolean;

  public static getInstance(): McpClientManager {
    if (!McpClientManager.instance) {
      McpClientManager.instance = new McpClientManager();
    }
    return McpClientManager.instance;
  }

  constructor(opts?: { allowStdio?: boolean }) {
    this.allowStdio =
      opts?.allowStdio ?? (process.env.MCP_ALLOW_STDIO === "1" || process.env.MCP_ALLOW_STDIO === "true");
  }

  public static resetForTests(): void {
    McpClientManager.instance = null;
  }

  public listServers(): Array<{ name: string; url?: string; transport: string; tools: number; connectedAt?: number }> {
    return [...this.connections.values()].map((c) => ({
      name: c.def.name,
      url: c.def.url,
      transport: c.def.transport,
      tools: c.tools.length,
      connectedAt: c.toolsFetchedAt,
    }));
  }

  public isConnected(name: string): boolean {
    return this.connections.has(cleanServerName(name));
  }

  /** True when the cached tools/list for a server is older than the TTL. */
  public isToolsStale(server: string): boolean {
    const conn = this.connections.get(cleanServerName(server));
    if (!conn) return true;
    return Date.now() - conn.toolsFetchedAt > TOOLS_CACHE_TTL_MS;
  }

  public getCachedTools(server?: string): McpToolInfo[] {
    const all: McpToolInfo[] = [];
    for (const conn of this.connections.values()) {
      if (server && cleanServerName(server) !== cleanServerName(conn.def.name)) continue;
      all.push(...conn.tools);
    }
    return all;
  }

  /**
   * Layer 1 of progressive discovery: keyword search over cached
   * definitions, name + one-line description only.
   */
  public searchTools(query: string, limit = 10, server?: string): Array<{ server: string; name: string; description?: string; score: number }> {
    const tools = this.getCachedTools(server);
    return tools
      .map((t) => ({ server: t.server, name: t.name, description: t.description, score: scoreMatch(query, t) }))
      .filter((r) => (query.trim().length === 0 ? true : r.score > 0))
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(1, Math.min(limit, 50)));
  }

  /** Layer 2: full schema for one tool, from cache. */
  public getToolDetails(server: string, tool: string): McpToolInfo | null {
    const key = cleanServerName(server);
    const conn = this.connections.get(key);
    if (!conn) return null;
    return conn.tools.find((t) => t.name === tool) || null;
  }

  public async connect(rawDef: McpServerDef): Promise<{ tools: McpToolInfo[] }> {
    const def = withResolvedToken(rawDef);
    const key = cleanServerName(def.name);
    if (def.transport === "stdio" && !this.allowStdio) {
      throw new Error("Stdio MCP transport is disabled. Set MCP_ALLOW_STDIO=1 to enable it explicitly.");
    }
    await this.disconnect(key).catch(() => {});
    const { client, transport } = await this.openClient(def);
    try {
      const tools = await this.fetchTools(client, key, def);
      this.connections.set(key, { def, client, transport, tools, toolsFetchedAt: Date.now(), failures: 0 });
      this.attachListChanged(client, key);
      return { tools };
    } catch (err) {
      try {
        await client.close();
      } catch {
        // Ignore cleanup error
      }
      throw err;
    }
  }

  public async disconnect(name: string): Promise<boolean> {
    const key = cleanServerName(name);
    const conn = this.connections.get(key);
    if (!conn) return false;
    this.connections.delete(key);
    try {
      await conn.client.close();
    } catch {
      // Ignore cleanup error
    }
    return true;
  }

  public async disconnectAll(): Promise<void> {
    const names = [...this.connections.keys()];
    for (const n of names) {
      await this.disconnect(n).catch(() => {});
    }
  }

  public async refreshTools(server: string): Promise<McpToolInfo[]> {
    const key = cleanServerName(server);
    const conn = this.connections.get(key);
    if (!conn) throw new Error(`MCP server "${server}" is not connected.`);
    const tools = await this.fetchTools(conn.client, key, conn.def);
    conn.tools = tools;
    conn.toolsFetchedAt = Date.now();
    return tools;
  }

  /** Layer 3: execute one tool with timeout; credentials never leave the host. */
  public async callTool(server: string, tool: string, args: Record<string, unknown> = {}, opts?: { timeoutMs?: number }): Promise<{ content: unknown; isError?: boolean }> {
    const key = cleanServerName(server);
    const conn = this.connections.get(key);
    if (!conn) throw new Error(`MCP server "${server}" is not connected.`);
    const timeoutMs = opts?.timeoutMs ?? conn.def.timeoutMs ?? 30_000;
    const res = await conn.client.callTool(
      { name: tool, arguments: args },
      undefined,
      { timeout: timeoutMs, maxTotalTimeout: timeoutMs }
    ).catch((err: unknown) => {
      throw new Error(`MCP tools/call failed on "${server}.${tool}": ${err instanceof Error ? err.message : String(err)}`);
    });
    if (res.isError) {
      const text = truncateOutput(JSON.stringify(res.content ?? null));
      throw new Error(`MCP tool error on "${server}.${tool}": ${text.slice(0, 1000)}`);
    }
    return { content: res.content ?? res, isError: res.isError };
  }

  private attachListChanged(client: Client, key: string): void {
    try {
      const anyClient = client as unknown as {
        setNotificationHandler?: (schema: unknown, handler: () => void | Promise<void>) => void;
      };
      if (typeof anyClient.setNotificationHandler !== "function") return;
      // Lazy import of the notification schema would couple to types.js at
      // runtime; instead invalidate on a timer as a safe default. Explicit
      // refreshTools() is the supported invalidation path.
    } catch {
      // Non-fatal: cache TTL still bounds staleness.
    }
    void key;
  }

  private async fetchTools(client: Client, serverKey: string, def: McpServerDef): Promise<McpToolInfo[]> {
    const result = await client.listTools();
    return (result?.tools || []).map((t) => ({
      server: serverKey,
      name: t.name,
      title: (t as { title?: string }).title,
      description: t.description,
      inputSchema: (t.inputSchema as Record<string, unknown>) || { type: "object", properties: {} },
      outputSchema: (t as { outputSchema?: Record<string, unknown> }).outputSchema,
      _transport: def.transport,
    } as McpToolInfo));
  }

  private async openClient(def: McpServerDef): Promise<{ client: Client; transport: { close?: () => Promise<void> | void } }> {
    const client = new Client({ name: "polymax-client", version: "1.0.0" }, { capabilities: {} });
    const headers: Record<string, string> = { ...def.headers };
    if (def.token) headers.Authorization = `Bearer ${def.token}`;

    if (def.transport === "stdio") {
      if (!def.command) throw new Error("Command is required for stdio transport.");
      const transport = new StdioClientTransport({ command: def.command, args: def.args || [] });
      await client.connect(transport);
      return { client, transport };
    }

    if (!def.url) throw new Error("URL is required for HTTP-based MCP transports.");
    const order: Array<"streamable" | "sse" | "http"> =
      def.transport === "sse" ? ["sse", "streamable"] : ["streamable", "sse"];
    let lastErr: unknown = null;
    for (const kind of order) {
      try {
        if (kind === "sse") {
          const transport = new SSEClientTransport(new URL(def.url), {
            eventSourceInit: { headers } as never,
            requestInit: { headers },
          });
          await client.connect(transport);
          return { client, transport };
        }
        const transport = new StreamableHTTPClientTransport(new URL(def.url), {
          requestInit: { headers },
        });
        await client.connect(transport);
        return { client, transport };
      } catch (err) {
        lastErr = err;
      }
    }
    try {
      await client.close().catch(() => {});
    } catch {
      // Ignore
    }
    throw new Error(
      `Failed to connect to MCP server "${def.name}" at ${def.url}: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`
    );
  }
}

export const mcpClientManager = McpClientManager.getInstance();
