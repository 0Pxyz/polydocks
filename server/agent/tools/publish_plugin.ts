import { z } from "zod";
import type { AgentTool } from "./types";
import { publishToRegistry } from "../../plugins/communityRegistry";

export interface PublishPluginArgs {
  pluginId: string;
  workspaceId?: string;
  author?: string;
  tags?: string[];
}

export const publish_plugin: AgentTool<PublishPluginArgs> = {
  name: "publish_plugin",
  description:
    "Publishes a verified workspace plugin to the PolyDocks community plugin store, making it discoverable and installable across workspaces with 1-click.",
  schema: z.object({
    pluginId: z.string().describe("ID of the synthesized or modified plugin to share"),
    workspaceId: z.string().optional().describe("Workspace where plugin currently lives"),
    author: z.string().optional().describe("Display name of the author or creator"),
    tags: z
      .array(z.string())
      .optional()
      .describe("Descriptive categories (e.g. ['productivity', 'timer', 'study'])"),
  }),
  execute: async (input, ctx) => {
    const workspaceId = input.workspaceId || ctx?.workspaceId || ctx?.cityId || "default";
    const res = await publishToRegistry({
      pluginId: input.pluginId,
      workspaceId,
      author: input.author || "PolyDocks User",
      tags: input.tags || ["community", "tool"],
    });

    if (!res.success) {
      return {
        success: false,
        error: res.error || `Failed to publish plugin "${input.pluginId}"`,
      };
    }

    return {
      success: true,
      pluginId: input.pluginId,
      item: res.item,
      message: `Plugin "${res.item?.name}" has been published to the Community Plugin Store.`,
    };
  },
};
