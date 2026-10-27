import { z } from "zod";
import type { AgentTool } from "./types";
import { tinyfish } from "../../discovery/tinyfish";
import { writeCityFile } from "../../workspace/cityWorkspace";

export const fetch_page: AgentTool<{
  urls: string[];
  cityId?: string;
  saveToSources?: boolean;
}> = {
  name: "fetch_page",
  description:
    "Fetches clean Chromium-rendered Markdown for up to 10 URLs via TinyFish Fetch API (1-20s latency, capped at 16KB).",
  schema: z.object({
    urls: z.array(z.string().url()).min(1).max(10).describe("Array of HTTP/HTTPS URLs to fetch"),
    cityId: z.string().optional().describe("Optional city workspace to persist source files into"),
    saveToSources: z.boolean().default(true).describe("Whether to save raw fetched markdown into city workspace sources/"),
  }),
  execute: async (args, ctx) => {
    const targetCity = args.cityId || ctx.cityId;
    const pages = await tinyfish.fetch(args.urls);

    if (args.saveToSources && targetCity) {
      for (const page of pages) {
        const slug = encodeURIComponent(
          page.url.replace(/^https?:\/\//, "").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40)
        );
        await writeCityFile(
          targetCity,
          `sources/${slug}.json`,
          JSON.stringify(page, null, 2)
        ).catch(() => {});
      }
    }

    return {
      count: pages.length,
      pages: pages.map((p) => ({
        url: p.url,
        status: p.status,
        markdownPreview: p.markdown.slice(0, 500),
      })),
    };
  },
};
