import { z } from "zod";
import type { AgentTool } from "./types";
import { PluginService } from "../../services/pluginService";

export interface PublishPluginArgs {
  pluginId: string;
  workspaceId?: string;
  author?: string;
  tags?: string[];
  idempotencyKey?: string;
  userApproved?: boolean;
}

export const publish_plugin: AgentTool<PublishPluginArgs> = {
  name: "publish_plugin",
  description:
    "Shares a verified plugin to the community store. Use only for verified work; do not publish drafts or fixes in progress.",
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
    userApproved: z
      .boolean()
      .optional()
      .describe("Set true only after the user explicitly said yes (install policy is ask-by-default)"),
  }),
  execute: async (input, ctx) => {

    // Install policy: agent writes need an explicit user yes.
    const { enforceInstallPolicy } = await import("../installPolicy");
    const denied = enforceInstallPolicy(ctx?.actor, (input as any).userApproved);
    if (denied) return denied;
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
