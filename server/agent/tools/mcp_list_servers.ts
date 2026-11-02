import { z } from "zod";
import type { AgentTool } from "./types";
import { McpClientManager } from "../../mcp/manager";

const McpListServersSchema = z.object({});

export const mcp_list_servers: AgentTool<typeof McpListServersSchema> = {
  name: "mcp_list_servers",
  description: "List connected external MCP servers with tool counts.",
  schema: McpListServersSchema,
  execute: async () => {
    const servers = McpClientManager.getInstance().listServers();
    return { servers };
  },
};
