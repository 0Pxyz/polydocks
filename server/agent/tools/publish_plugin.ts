import { z } from "zod";
import type { AgentTool } from "./types";
import { PluginService } from "../../services/pluginService";

export interface PublishPluginArgs {
  pluginId: string;
  workspaceId?: string;
  author?: string;
  tags?: string[];
  idempotencyKey?: string;
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
    idempotencyKey: z
      .string()
      .optional()
      .describe("Optional idempotency key to prevent duplicate publishing"),
  }),
  execute: async (input, ctx) => {
    const workspaceId = input.workspaceId || ctx?.workspaceId || ctx?.cityId || "default";

    return await PluginService.publishPlugin({
      pluginId: input.pluginId,
      workspaceId,
      author: input.author,
      tags: input.tags,
      actor: "agent",
      idempotencyKey: input.idempotencyKey,
    });
  },
};
