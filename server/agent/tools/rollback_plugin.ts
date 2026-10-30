import { z } from "zod";
import type { AgentTool } from "./types";
import { pluginRollback } from "../../facade/shared";

export const rollback_plugin: AgentTool<{
  pluginId: string;
  version: string;
  workspaceId?: string;
}> = {
  name: "rollback_plugin",
  description:
    "Rolls a plugin back to a kept version (append-only history, nothing deleted). Use to recover from a bad edit. Same handler as POST /api/plugins/:id/rollback and the CLI.",
  schema: z.object({
    pluginId: z.string().min(1).describe("Plugin id to roll back"),
    version: z.string().min(1).describe("Kept version to restore"),
    workspaceId: z.string().optional().describe("Workspace where the plugin lives"),
  }),
  execute: async (args, ctx) =>
    pluginRollback(args.pluginId, args.version, args.workspaceId || ctx?.workspaceId),
};
