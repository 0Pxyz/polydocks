import { z } from "zod";
import type { AgentTool } from "./types";
import { searchCatalog } from "../../icons/catalog";

export interface SearchIconsArgs {
  query: string;
  limit?: number;
}

export const search_icons: AgentTool<SearchIconsArgs> = {
  name: "search_icons",
  description:
    "Searches the renderable dock icon catalog with 1 to 3 meaning-based keywords. Returns valid icon ids, labels, categories, and tags to use when creating or updating dock tabs and plugins. Every returned id resolves in the dock; never invent icon names.",
  schema: z.object({
    query: z
      .string()
      .min(1)
      .describe(
        "1 to 3 search terms reflecting the purpose of the experience (e.g. 'flashcards study', 'quantum physics', 'stock market', 'music')"
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(20)
      .default(8)
      .optional()
      .describe("Maximum number of results to return (default: 8)"),
  }),
  execute: async (args) => {
    const results = searchCatalog(args.query, args.limit || 8);
    return {
      query: args.query,
      count: results.length,
      icons: results,
    };
  },
};
