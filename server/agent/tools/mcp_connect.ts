import { z } from "zod";
import type { AgentTool } from "./types";
import { connectMcpServer } from "../../plugins/adapters/mcp";

const McpConnectSchema = z.object({
  name: z.string().min(1).describe("Short server name, e.g. 'github' or 'postgres'"),
  url: z.string().url().optional().describe("Server Streamable HTTP / SSE URL"),
  transport: z.enum(["streamable", "sse", "stdio"]).default("streamable").describe("MCP transport"),
  token: z.string().optional().describe("Bearer token (prefer server-side env instead)"),
  command: z.string().optional().describe("Stdio command (gated: needs explicit approval)"),
  args: z.array(z.string()).default([]).describe("Stdio args"),
});

type McpConnectInput = z.infer<typeof McpConnectSchema>;

export const mcp_connect: AgentTool<typeof McpConnectSchema> = {
  name: "mcp_connect",
  description:
    "Connect an external MCP server to PolyDocks. Discovers tools and installs them as mcp.<server>.<tool> capabilities. The agent never fetches credentials itself.",
  schema: McpConnectSchema,
  execute: async (input: McpConnectInput) => {
    if (!input.url && !input.command) {
      return { success: false, error: "Either 'url' or 'command' is required." };
    }
    const result = await connectMcpServer({
      name: input.name,
      url: input.url,
      token: input.token,
      transport: input.transport,
      command: input.command,
      args: input.args,
    });
    if (!result.success) {
      return { success: false, error: result.error || "MCP connect failed." };
    }
    return {
      success: true,
      plugin: result.plugin?.id,
      tools: result.tools.map((t) => t.name),
    };
  },
};
