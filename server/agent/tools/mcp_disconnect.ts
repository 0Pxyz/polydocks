import { z } from "zod";
import type { AgentTool } from "./types";
import { McpClientManager } from "../../mcp/manager";
import { pluginRegistry } from "../../plugins/registry";

const McpDisconnectSchema = z.object({
  name: z.string().min(1).describe("Server name passed to mcp_connect"),
  keepPlugin: z.boolean().default(false).describe("Keep the installed plugin after disconnect"),
});

type McpDisconnectInput = z.infer<typeof McpDisconnectSchema>;

export const mcp_disconnect: AgentTool<typeof McpDisconnectSchema> = {
  name: "mcp_disconnect",
  description: "Disconnect an external MCP server, freeing its context. Optionally keeps the installed plugin.",
  schema: McpDisconnectSchema,
  execute: async (input: McpDisconnectInput) => {
    await McpClientManager.getInstance().disconnect(input.name);
    if (!input.keepPlugin) {
      const cleanId = `mcp_${input.name.toLowerCase().replace(/[^a-z0-9_-]/g, "_")}`;
      pluginRegistry.uninstall(cleanId);
    }
    return { success: true, name: input.name };
  },
};
