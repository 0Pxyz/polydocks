import { Hono } from "hono";
import { getCityContext, writeCityFile, readCityFile } from "../workspace/cityWorkspace";
import { generateCityFeed } from "../discovery/feedGenerator";
import { defaultTools } from "../agent/tools";
import { capabilityBus } from "../plugins/bus";
import fs from "node:fs/promises";
import path from "node:path";

export const mcpRouter = new Hono();

const CORE_MCP_TOOLS = [
  {
    name: "list_cities",
    description: "Lists all knowledge cities and workspaces on the Polymax World Map.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_city_workspace",
    description: "Retrieves the complete workspace context of a city (notes, tabs, feed).",
    inputSchema: {
      type: "object",
      properties: {
        cityId: { type: "string", description: "City slug identifier" },
      },
      required: ["cityId"],
    },
  },
  {
    name: "create_city_note",
    description: "Creates or updates a markdown note in the specified city workspace.",
    inputSchema: {
      type: "object",
      properties: {
        cityId: { type: "string" },
        path: { type: "string", description: "Relative path inside notes/ (e.g. 'notes/summary.md')" },
        content: { type: "string", description: "Markdown text content" },
      },
      required: ["cityId", "path", "content"],
    },
  },
  {
    name: "synthesize_dock_plugin",
    description: "Synthesizes and mounts a new dynamic tool tab into the city's Agentic Dock.",
    inputSchema: {
      type: "object",
      properties: {
        cityId: { type: "string" },
        id: { type: "string" },
        title: { type: "string" },
        icon: { type: "string" },
        html: { type: "string" },
      },
      required: ["cityId", "id", "title", "html"],
    },
  },
  {
    name: "run_tinyfish_research",
    description: "Triggers automated web discovery using TinyFish to curate papers and videos for a city.",
    inputSchema: {
      type: "object",
      properties: {
        cityId: { type: "string" },
        topic: { type: "string" },
      },
      required: ["cityId", "topic"],
    },
  },
];

/**
 * Verifies loopback origin or bearer token authentication when reachable beyond localhost.
 */
function isAuthorizedMcpRequest(c: any): boolean {
  let hostname = "";
  try {
    const url = new URL(c.req.url);
    hostname = url.hostname;
  } catch {
    hostname = "";
  }

  const hostHeader = c.req.header("host") || "";
  const authHeader = c.req.header("authorization") || "";
  const isLoopback =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostHeader.startsWith("localhost") ||
    hostHeader.startsWith("127.0.0.1") ||
    hostHeader.startsWith("[::1]");

  const configuredToken = process.env.MCP_TOKEN;

  // If a token is explicitly configured, enforce it regardless
  if (configuredToken && configuredToken.trim().length > 0) {
    const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
    return bearer === configuredToken.trim();
  }

  // If request arrives from beyond loopback without local origin, require bearer auth
  if (!isLoopback) {
    if (!authHeader) return false;
    return authHeader.length > 0;
  }

  return true;
}

/**
 * Handles Model Context Protocol JSON-RPC 2.0 requests
 */
mcpRouter.post("/", async (c) => {
  if (!isAuthorizedMcpRequest(c)) {
    return c.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32000, message: "Unauthorized: MCP bearer token required for remote access" },
      },
      401
    );
  }

  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400);
  }

  const { jsonrpc, id, method, params } = body;

  if (jsonrpc !== "2.0") {
    return c.json({ jsonrpc: "2.0", id: id || null, error: { code: -32600, message: "Invalid Request" } }, 400);
  }

  switch (method) {
    case "initialize": {
      return c.json({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2024-11-05",
          serverInfo: {
            name: "polymax",
            version: "0.1.0",
          },
          capabilities: {
            tools: {},
            resources: {},
          },
        },
      });
    }

    case "tools/list": {
      // Dynamic catalog from capability bus merged with core tools
      const busCapabilities = capabilityBus.getCapabilities({ enabledOnly: true }).map((cap) => ({
        name: cap.id,
        description: cap.description,
        inputSchema: cap.inputSchema || { type: "object", properties: {} },
      }));

      const toolNames = new Set(CORE_MCP_TOOLS.map((t) => t.name));
      const mergedTools = [...CORE_MCP_TOOLS];
      for (const cap of busCapabilities) {
        if (!toolNames.has(cap.name)) {
          mergedTools.push(cap);
          toolNames.add(cap.name);
        }
      }

      return c.json({
        jsonrpc: "2.0",
        id,
        result: {
          tools: mergedTools,
        },
      });
    }

    case "tools/call": {
      const toolName = params?.name;
      const args = params?.arguments || {};

      try {
        let executionResult: unknown;

        // 1. Try capability bus first if registered
        const registeredCap = capabilityBus.getCapability(toolName);
        if (registeredCap) {
          const res = await capabilityBus.invoke(toolName, args, {
            actor: "user",
            cityId: args.cityId,
          });
          if (!res.success) {
            throw new Error(res.error || "Capability execution failed");
          }
          executionResult = res.data;
        } else if (toolName === "list_cities") {
          const workspaceRoot = path.resolve(process.cwd(), "workspace");
          try {
            const entries = await fs.readdir(workspaceRoot, { withFileTypes: true });
            const cityDirs = entries.filter((e) => e.isDirectory() && !e.name.startsWith(".")).map((e) => e.name);
            executionResult = { cities: cityDirs };
          } catch {
            executionResult = { cities: [] };
          }
        } else if (toolName === "get_city_workspace") {
          executionResult = await getCityContext(args.cityId);
        } else if (toolName === "create_city_note") {
          await writeCityFile(args.cityId, args.path, args.content);
          executionResult = { success: true, path: args.path, cityId: args.cityId };
        } else if (toolName === "synthesize_dock_plugin") {
          const createTool = defaultTools.find((t) => t.name === "create_tab");
          if (!createTool) throw new Error("create_tab tool not found");
          executionResult = await createTool.execute(
            { id: args.id, title: args.title, icon: args.icon || "Layers", html: args.html, cityId: args.cityId },
            { cityId: args.cityId, step: 1 }
          );
        } else if (toolName === "run_tinyfish_research") {
          executionResult = await generateCityFeed(args.cityId, args.topic);
        } else {
          return c.json({
            jsonrpc: "2.0",
            id,
            error: { code: -32601, message: `Tool "${toolName}" not found` },
          });
        }

        return c.json({
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: typeof executionResult === "string" ? executionResult : JSON.stringify(executionResult, null, 2),
              },
            ],
          },
        });
      } catch (err: any) {
        return c.json({
          jsonrpc: "2.0",
          id,
          result: {
            isError: true,
            content: [
              {
                type: "text",
                text: `Execution error: ${err.message || String(err)}`,
              },
            ],
          },
        });
      }
    }

    case "resources/list": {
      return c.json({
        jsonrpc: "2.0",
        id,
        result: {
          resources: [
            {
              uri: "workspace://current/feed",
              name: "Active City Feed",
              mimeType: "application/json",
            },
            {
              uri: "workspace://current/notes",
              name: "Active City Notes",
              mimeType: "text/markdown",
            },
          ],
        },
      });
    }

    case "resources/read": {
      const uri = params?.uri;
      if (!uri) {
        return c.json({ jsonrpc: "2.0", id, error: { code: -32602, message: "Missing uri parameter" } });
      }

      // Parse workspace://<city>/<subpath>
      const match = uri.match(/^workspace:\/\/([^/]+)\/(.+)$/);
      if (!match) {
        return c.json({ jsonrpc: "2.0", id, error: { code: -32602, message: "Invalid workspace URI format" } });
      }

      const [, cityId, subpath] = match;
      try {
        const content = await readCityFile(cityId, subpath);
        return c.json({
          jsonrpc: "2.0",
          id,
          result: {
            contents: [
              {
                uri,
                mimeType: subpath.endsWith(".json") ? "application/json" : "text/markdown",
                text: content,
              },
            ],
          },
        });
      } catch (err: any) {
        return c.json({
          jsonrpc: "2.0",
          id,
          error: { code: -32000, message: `Resource read failed: ${err.message}` },
        });
      }
    }

    default:
      return c.json({ jsonrpc: "2.0", id, error: { code: -32601, message: `Method "${method}" not found` } }, 404);
  }
});
