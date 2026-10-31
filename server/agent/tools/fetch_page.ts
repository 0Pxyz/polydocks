import { z } from "zod";
import type { AgentTool } from "./types";
import { capabilityBus } from "../../plugins/bus";

export const fetch_page: AgentTool<{
  urls: string[];
  workspaceId?: string;
  saveToSources?: boolean;
}> = {
  name: "fetch_page",
  description:
    "Reads up to 10 URLs as capped markdown and saves to sources with a workspace scope. Use to read found sources; do not use to discover URLs (use search_web) or to display them (use open_source).",
  schema: z.object({
    urls: z.array(z.string().url()).min(1).max(10).describe("Array of HTTP/HTTPS URLs to fetch"),
    workspaceId: z.string().optional().describe("Optional workspace to persist source files into"),
    saveToSources: z.boolean().default(true).describe("Whether to save fetched pages into the workspace sources feed"),
  }),
  execute: async (args, ctx) => {
    // Thin alias over the canonical capabilities: search.fetch reads, sources.add
    // persists. No raw JSON dumps to workspace/sources/ — the sources table is
    // the canonical store (see server/plugins/sources.ts).
    const { initializeFirstPartyPlugins } = await import("../../plugins/first-party/index");
    initializeFirstPartyPlugins();
    const targetWorkspace = args.workspaceId || (ctx as any)?.workspaceId;
    const pages: Array<{ url: string; status: number; markdown: string; markdownPreview: string }> = [];

    for (const url of args.urls) {
      const fetched = await capabilityBus.invoke("search.fetch", { url }, {
        actor: "agent",
        workspaceId: targetWorkspace,
        step: (ctx as any)?.step,
      });
      if (!fetched.success) {
        pages.push({
          url,
          status: 0,
          markdown: `# ${url}\n\nFetch failed: ${fetched.error || "unknown error"}.`,
          markdownPreview: (fetched.error || "fetch failed").slice(0, 500),
        });
        continue;
      }
      const data = fetched.data as any;
      // search.fetch may return a single FetchResult or an array; normalize.
      const item = Array.isArray(data) ? data.find((d: any) => d?.url === url) || data[0] : data;
      const rawMarkdown = typeof item?.markdown === "string" ? item.markdown : typeof item?.text === "string" ? item.text : "";
      const status = typeof item?.status === "number" ? item.status : 200;
      const markdown = rawMarkdown.length > 8000 ? rawMarkdown.slice(0, 8000) + "\n\n...[truncated for model context]..." : rawMarkdown;
      pages.push({ url, status, markdown, markdownPreview: rawMarkdown.slice(0, 500) });

      // Canonical persistence: sources.add (dedupe + enrichment + audit).
      // Failures here never fail the read itself.
      if (args.saveToSources && targetWorkspace) {
        try {
          await capabilityBus.invoke("sources.add", { url, workspaceId: targetWorkspace }, {
            actor: "agent",
            workspaceId: targetWorkspace,
            step: (ctx as any)?.step,
          });
        } catch {
          // Non-fatal: the page content above is still returned.
        }
      }
    }

    return {
      count: pages.length,
      pages,
    };
  },
};
