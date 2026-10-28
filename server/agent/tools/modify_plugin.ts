import { z } from "zod";
import type { AgentTool } from "./types";
import { PluginService } from "../../services/pluginService";

export interface ModifyPluginArgs {
  id: string;
  code: string;
  changeSummary: string;
  name?: string;
  description?: string;
  icon?: string;
  workspaceId?: string;
}

export const modify_plugin: AgentTool<ModifyPluginArgs> = {
  name: "modify_plugin",
  description:
    "Modifies an existing plugin in-place without duplicating dock entries or destroying existing saved user data. Updates code, bumps version, and preserves storage keys.",
  schema: z.object({
    id: z
      .string()
      .regex(/^[a-z0-9_-]+$/)
      .describe("ID of the existing plugin to modify"),
    code: z
      .string()
      .min(10)
      .describe(
        "Updated self-contained TypeScript/JavaScript code for the plugin UI. Forbidden from external imports. Uses window.polydocks.storage for state."
      ),
    changeSummary: z
      .string()
      .min(1)
      .describe("Clear explanation of what was changed, added, or fixed"),
    name: z.string().optional().describe("Optional updated display name"),
    description: z.string().optional().describe("Optional updated description"),
    icon: z.string().optional().describe("Optional updated Phosphor icon name"),
    workspaceId: z.string().optional().describe("Workspace where plugin is located"),
  }),
  execute: async (args, ctx) => {
    const workspaceId = args.workspaceId || ctx?.workspaceId || ctx?.cityId || "default";

    return await PluginService.modifyPlugin({
      id: args.id,
      code: args.code,
      changeSummary: args.changeSummary,
      name: args.name,
      description: args.description,
      icon: args.icon,
      workspaceId,
      actor: "agent",
    });
  },
};
