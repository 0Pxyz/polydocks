import { z } from "zod";
import type { AgentTool } from "./types";
import { agentTask } from "../../facade/shared";

export const list_tasks: AgentTool<{
  status?: string;
  sessionId?: string;
  workspaceId?: string;
}> = {
  name: "list_tasks",
  description:
    "Lists background tasks with optional filters (read-only). Use to check running work before starting duplicates.",
  schema: z.object({
    status: z.string().optional().describe("Filter by task status"),
    sessionId: z.string().optional().describe("Filter by session id"),
    workspaceId: z.string().optional().describe("Filter by workspace id"),
  }),
  execute: async (args, ctx) =>
    agentTask("list", {
      status: args.status,
      sessionId: args.sessionId,
      workspaceId: args.workspaceId || ctx?.workspaceId,
    }, {
      actor: "agent",
      cityId: ctx?.cityId,
      workspaceId: args.workspaceId || ctx?.workspaceId,
      sessionId: ctx?.sessionId,
    }),
};
