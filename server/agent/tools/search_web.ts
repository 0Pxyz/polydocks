import { z } from "zod";
import type { AgentTool } from "./types";
import { capabilityBus } from "../../plugins/bus";

export const search_web: AgentTool<{
  query: string;
  domain_type?: "web" | "news" | "research_paper";
  limit?: number;
}> = {
  name: "search_web",
  description:
    "Finds candidate URLs across web, news, or research papers (kind-tagged, primary sources first, with a coverage note for requested media types that came back empty). Use to discover sources; it reads nothing (use fetch_page).",
  schema: z.object({
    query: z.string().min(1).describe("Search query string (e.g. 'Raft consensus algorithm visual tutorial')"),
    domain_type: z
      .enum(["web", "news", "research_paper"])
      .default("web")
      .describe("Category of content to search"),
    limit: z.number().int().min(1).max(20).default(5),
  }),
  execute: async (args, ctx) => {
    // Thin alias over the canonical search.web capability: one implementation,
    // one policy check, one audit trail. Public tool contract is preserved.
    const { initializeFirstPartyPlugins } = await import("../../plugins/first-party/index");
    initializeFirstPartyPlugins();
    const targetWorkspace = (ctx as any)?.workspaceId;
    const result = await capabilityBus.invoke("search.web", {
      query: args.query,
      domainType: args.domain_type || "web",
      limit: args.limit ?? 5,
    }, {
      actor: "agent",
      workspaceId: targetWorkspace,
      step: (ctx as any)?.step,
      taskId: (ctx as any)?.taskId,
      onEvent: (ctx as any)?.onEvent,
    });
    if (!result.success) {
      return {
        query: args.query,
        domain_type: args.domain_type || "web",
        count: 0,
        results: [],
        error: result.error,
      };
    }
    const hits = (Array.isArray(result.data) ? result.data : (result.data as any)?.results ?? result.data) as any[];
    const list = Array.isArray(hits) ? hits : [];
    return {
      query: args.query,
      domain_type: args.domain_type || "web",
      count: list.length,
      results: list,
      // Explicit media coverage (#348): when non-null, state the missing
      // types to the user instead of implying the brief was fully covered.
      coverage: !Array.isArray(result.data) ? (result.data as any)?.coverage ?? null : null,
    };
  },
};
