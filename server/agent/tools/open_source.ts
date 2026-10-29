import { z } from "zod";
import type { AgentTool } from "./types";

export const open_source: AgentTool<{ url: string; title?: string }> = {
  name: "open_source",
  description: "Shows a URL in the Browser tab. Use to display a link; it fetches no text (use fetch_page) and primes no study state (use open_intent).",
  schema: z.object({
    url: z.string().url().describe("Valid HTTP or HTTPS URL to open"),
    title: z.string().optional().describe("Optional title for tab display"),
  }),
  execute: async (args) => {
    return {
      success: true,
      url: args.url,
      title: args.title,
      action: "browser.open",
    };
  },
};
