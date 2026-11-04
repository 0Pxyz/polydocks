import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { capabilityBus } from "../plugins/bus";
import { pluginRegistry } from "../plugins/registry";

const SERVER_NAME = "polydocks";
const SERVER_VERSION = "1.0.0";

function normalizeInputSchema(input: unknown): Record<string, unknown> {
  if (input && typeof input === "object" && !Array.isArray(input)) {
    // Zod schemas (used in-process by some first-party registrations) expose
    // .type as a string and .required as a method: convert to JSON Schema.
    const maybeZod = input as Record<string, unknown>;
    if (typeof maybeZod.safeParse === "function" || typeof maybeZod.parse === "function") {
      try {
        const converted = z.toJSONSchema(input as never) as Record<string, unknown>;
        if (converted && typeof converted === "object") return converted;
      } catch {
        // Fall through to the default below.
      }
      return { type: "object", properties: {} };
    }
    const obj = maybeZod;
    if (typeof obj.type === "string") return obj;
    if (obj.properties || obj.allOf || obj.anyOf || obj.oneOf) {
      return { type: "object", ...obj };
    }
  }
  return { type: "object", properties: {} };
}

function normalizeOutputSchema(output: unknown): Record<string, unknown> | undefined {
  if (!output || typeof output !== "object" || Array.isArray(output)) return undefined;
  const obj = output as Record<string, unknown>;
  if (typeof obj.safeParse === "function" || typeof obj.parse === "function") {
    try {
      const converted = z.toJSONSchema(output as never) as Record<string, unknown>;
      if (converted && typeof converted === "object") return converted;
    } catch {
      return undefined;
    }
    return undefined;
  }
  if (typeof obj.type === "string" || obj.properties || obj.allOf || obj.anyOf || obj.oneOf) {
    return obj;
  }
  return undefined;
}

function toToolName(capabilityId: string): string {
  const safe = capabilityId.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 128);
  return safe.length > 0 ? safe : "unknown_tool";
}

/**
 * Build a fresh PolyDocks MCP server that proxies the typed capability
 * bus. A new instance per request keeps the Streamable HTTP transport
 * stateless: no session affinity, safe behind any replica.
 */
export function buildPolyMcpServer(): Server {
  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {}, resources: {}, prompts: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const caps = capabilityBus.getCapabilities({ enabledOnly: true });
    return {
      tools: caps.map((c) => {
        const outputSchema = normalizeOutputSchema(c.outputSchema);
        return {
          name: toToolName(c.id),
          description: c.description || c.title,
          inputSchema: normalizeInputSchema(c.inputSchema),
          ...(outputSchema ? { outputSchema } : {}),
          annotations: {
            title: c.title,
            readOnlyHint: c.risk === "read",
            destructiveHint: c.risk === "destructive",
            openWorldHint: c.risk === "external",
          },
        };
      }),
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const toolName = request.params.name;
    const args = (request.params.arguments || {}) as Record<string, unknown>;
    const caps = capabilityBus.getCapabilities({ enabledOnly: true });
    const match = caps.find((c) => toToolName(c.id) === toolName || c.id === toolName);
    if (!match) {
      return {
        isError: true,
        content: [{ type: "text", text: `Unknown tool "${toolName}". Call tools/list first.` }],
      };
    }
    const result = await capabilityBus.invoke(match.id, args, { actor: "user" });
    if (!result.success) {
      return {
        isError: true,
        content: [{ type: "text", text: result.error || `Capability "${match.id}" failed.` }],
      };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(result.data ?? null).slice(0, 65_536) }],
    };
  });

  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
      resources: [
        {
          uri: "polydocks://plugins",
          name: "plugins",
          title: "Installed plugins",
          description: "Installed PolyDocks plugins with trust and status.",
          mimeType: "application/json",
        },
        {
          uri: "polydocks://capabilities",
          name: "capabilities",
          title: "Capability catalog",
          description: "Unified capability catalog with risk and schemas.",
          mimeType: "application/json",
        },
      ],
    };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uri = request.params.uri;
    if (uri === "polydocks://plugins") {
      const plugins = pluginRegistry.list().map((p) => ({
        id: p.id,
        name: p.name,
        version: p.manifest.version,
        trust: p.trust,
        enabled: p.enabled,
        capabilities: p.manifest.capabilities?.length || 0,
      }));
      return {
        contents: [{ uri, mimeType: "application/json", text: JSON.stringify(plugins) }],
      };
    }
    if (uri === "polydocks://capabilities") {
      const caps = capabilityBus.getCapabilities({ enabledOnly: false }).map((c) => ({
        id: c.id,
        pluginId: c.pluginId,
        title: c.title,
        risk: c.risk,
      }));
      return {
        contents: [{ uri, mimeType: "application/json", text: JSON.stringify(caps) }],
      };
    }
    throw new Error(`Unknown resource "${uri}".`);
  });

  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    return {
      prompts: [
        {
          name: "dock-overview",
          title: "Dock overview",
          description: "How to operate the PolyDocks agentic dock.",
        },
      ],
    };
  });

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    if (request.params.name !== "dock-overview") {
      throw new Error(`Unknown prompt "${request.params.name}".`);
    }
    return {
      description: "How to operate the PolyDocks agentic dock.",
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: "The UI is an Agentic Dock: find_capabilities first, then invoke. Never duplicate what exists; fix by patching in place. Dark mode only.",
          },
        },
      ],
    };
  });

  return server;
}
