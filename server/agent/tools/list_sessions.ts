import { z } from "zod";
import type { AgentTool } from "./types";
import { agentSession } from "../../facade/shared";

export const list_sessions: AgentTool<{ workspaceId?: string }> = {
  name: "list_sessions",
  description:
    "Lists persistent work sessions for a workspace (read-only). Use to find prior work before resuming; never fabricate session ids.",
  schema: z.object({
    workspaceId: z.string().optional().describe("Workspace to list sessions for"),
  }),
  execute: async (args, ctx) =>
    agentSession("list", { workspaceId: args.workspaceId || ctx?.workspaceId }, {
      actor: "agent",
      workspaceId: ctx?.workspaceId,
      workspaceId: args.workspaceId || ctx?.workspaceId,
      sessionId: ctx?.sessionId,
    }),
};
