import { z } from "zod";
import type { AgentTool } from "./types";
import { pluginLifecycle } from "../../facade/shared";

export const install_plugin: AgentTool<{
  pluginId: string;
  workspaceId?: string;
  cityId?: string;
  userApproved?: boolean;
}> = {
  name: "install_plugin",
  description:
    "Installs a store plugin into a workspace (or mounts a local one). Use after the dock and store have nothing suitable; agent origin needs { userApproved: true }. Same handler as POST /api/plugins/lifecycle and the CLI.",
  schema: z.object({
    pluginId: z.string().min(1).describe("Store plugin id to install"),
    workspaceId: z.string().optional().describe("Workspace to install into"),
    cityId: z.string().optional().describe("City workspace scope"),
    userApproved: z.boolean().optional().describe("Set true only after the user explicitly said yes (install policy is ask-by-default)"),
  }),
  execute: async (args, ctx) =>
    pluginLifecycle("install", args as Record<string, unknown>, {
      actor: "agent",
      cityId: args.cityId || ctx?.cityId,
      workspaceId: args.workspaceId || ctx?.workspaceId,
      sessionId: ctx?.sessionId,
    }),
};
