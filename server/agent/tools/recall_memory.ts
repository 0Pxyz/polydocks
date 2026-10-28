import { z } from "zod";
import type { AgentTool } from "./types";
import { recallMemory } from "../memory";

export const recall_memory: AgentTool<{
  query: string;
  category?: string;
  maxTokens?: number;
}> = {
  name: "recall_memory",
  description:
    "Recalls relevant long-term memories, user preferences, architectural decisions, and daily insights from persistent agent storage.",
  schema: z.object({
    query: z
      .string()
      .describe("Keywords, topic, or question to recall from persistent memory"),
    category: z
      .string()
      .optional()
      .describe("Optional category filter (e.g. 'user_preference', 'architectural_rule', 'project_insight')"),
    maxTokens: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Optional maximum tokens to retrieve (default: 800)"),
  }),
  execute: async (args) => {
    const results = await recallMemory({
      query: args.query,
      category: args.category,
      maxTokens: args.maxTokens,
    });
    return {
      query: args.query,
      count: results.length,
      memories: results,
    };
  },
};
