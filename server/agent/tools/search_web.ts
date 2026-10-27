import { z } from "zod";
import type { AgentTool } from "./types";
import { tinyfish } from "../../discovery/tinyfish";

export const search_web: AgentTool<{
  query: string;
  domain_type?: "web" | "news" | "research_paper";
  limit?: number;
}> = {
  name: "search_web",
  description:
    "Performs live web research via TinyFish Search API across web, news, or academic research papers (1-3s latency).",
  schema: z.object({
    query: z.string().min(1).describe("Search query string (e.g. 'Raft consensus algorithm visual tutorial')"),
    domain_type: z
      .enum(["web", "news", "research_paper"])
      .default("web")
      .describe("Category of content to search"),
    limit: z.number().int().min(1).max(20).default(5),
  }),
  execute: async (args) => {
    const hits = await tinyfish.search(args.query, args.domain_type, args.limit);
    return {
      query: args.query,
      domain_type: args.domain_type || "web",
      count: hits.length,
      results: hits,
    };
  },
};
