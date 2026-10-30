import { z } from "zod";
import type { AgentTool } from "./types";
import { agentSession } from "../../facade/shared";

export const inspect_session: AgentTool<{ sessionId: string; fromStep?: number }> = {
  name: "inspect_session",
  description:
    "Reads a work session and its transcript tail (read-only). Use to resume prior work with context; do not invent session content.",
  schema: z.object({
    sessionId: z.string().min(1).describe("Session id to resume"),
    fromStep: z.number().int().min(0).optional().describe("Replay transcript from this step"),
  }),
  execute: async (args, ctx) =>
    agentSession("resume", { sessionId: args.sessionId, fromStep: args.fromStep }, {
      actor: "agent",
      cityId: ctx?.cityId,
      workspaceId: ctx?.workspaceId,
      sessionId: ctx?.sessionId,
    }),
};
