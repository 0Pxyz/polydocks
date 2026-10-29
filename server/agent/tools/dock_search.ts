import { z } from "zod";
import type { AgentTool } from "./types";
import { searchDockCatalog } from "./dockCatalog";

export const dock_search: AgentTool<{ query?: string; cityId?: string; limit?: number }> = {
  name: "dock_search",
  description:
    "Searches everything the Agentic Dock can show: builtin tools, city tabs, installed workspace plugins, and community store plugins. Call it when the user asks to find, open, pin, or manage a dock item. Read-only: it never installs, pins, or deletes anything.",
  schema: z.object({
    query: z.string().optional().describe("Search text (e.g. 'GTM feed', 'flashcards')"),
    cityId: z.string().optional().describe("City workspace scope (defaults to active city)"),
    limit: z.number().min(1).max(50).optional().describe("Maximum results (default 20)"),
  }),
  execute: async (args, ctx) => {
    const results = await searchDockCatalog({
      query: args.query,
      cityId: args.cityId || ctx.cityId,
      workspaceId: ctx.workspaceId || ctx.cityId,
      limit: args.limit,
    });
    return {
      success: true,
      query: args.query || "",
      results: results.map((entry) => ({
        id: entry.id,
        title: entry.title,
        description: entry.description,
        icon: entry.icon,
        kind: entry.kind,
        installed: entry.kind !== "store",
      })),
    };
  },
};
