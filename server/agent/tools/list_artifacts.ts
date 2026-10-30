import { z } from "zod";
import type { AgentTool } from "./types";
import { agentArtifacts } from "../../facade/shared";

export const list_artifacts: AgentTool<{ workspaceId?: string; sessionId?: string }> = {
  name: "list_artifacts",
  description:
    "Lists workspace artifacts such as documents and exports (read-only). Use to find prior outputs before recreating them.",
  schema: z.object({
    workspaceId: z.string().optional().describe("Workspace to list artifacts for"),
    sessionId: z.string().optional().describe("Filter by session id"),
  }),
  execute: async (args, ctx) =>
    agentArtifacts("list", {
      workspaceId: args.workspaceId || ctx?.workspaceId,
      sessionId: args.sessionId || ctx?.sessionId,
    }),
};
