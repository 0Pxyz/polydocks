import { z } from "zod";
import type { AgentTool } from "./types";
import { McpClientManager } from "../../mcp/manager";

const McpSearchToolsSchema = z.object({
  query: z.string().describe("Natural-language query, e.g. 'update salesforce record'"),
  limit: z.number().int().min(1).max(20).default(10).describe("Max results"),
  server: z.string().optional().describe("Restrict to one connected server"),
});

type McpSearchToolsInput = z.infer<typeof McpSearchToolsSchema>;

/**
 * Progressive discovery Layer 1 over connected MCP servers:
 * returns name + one-line description only. Call find_capabilities /
 * invoke_capability (Layer 3) to run the tool.
 */
export const mcp_search_tools: AgentTool<typeof McpSearchToolsSchema> = {
  name: "mcp_search_tools",
  description:
    "Progressive discovery over connected MCP servers: keyword search returning tool names with one-line descriptions. Inspect the capability schema, then invoke_capability.",
  schema: McpSearchToolsSchema,
  execute: async (input: McpSearchToolsInput) => {
    const results = McpClientManager.getInstance().searchTools(input.query, input.limit, input.server);
    return { query: input.query, found: results.length, tools: results };
  },
};
