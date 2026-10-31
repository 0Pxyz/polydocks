import { z } from "zod";
import type { AgentTool } from "./types";
import { recordMemory } from "../memory";

export const record_memory: AgentTool<{
  content: string;
  category?: string;
  durable?: boolean;
  workspaceId?: string;
}> = {
  name: "record_memory",
  description:
    "Stores an observation or preference with a category. Use for durable facts; do not log turn-by-turn chatter.",
  schema: z.object({
    content: z
      .string()
      .describe("The observation, user preference, technical decision, or insight to remember"),
    category: z
      .enum([
        "user_preference",
        "architectural_rule",
        "project_insight",
        "tool_usage",
        "general",
      ])
      .optional()
      .describe("Category of the memory entry"),
    durable: z
      .boolean()
      .optional()
      .describe("If true, promotes the memory to long-term MEMORY.md (default: false)"),
    workspaceId: z
      .string()
      .optional()
      .describe("Optional workspace identifier to associate with the memory"),
  }),
  execute: async (args) => {
    return await recordMemory({
      content: args.content,
      category: args.category,
      durable: args.durable,
      workspaceId: args.workspaceId,
    });
  },
};
