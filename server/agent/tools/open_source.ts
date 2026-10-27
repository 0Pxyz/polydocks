import { z } from "zod";
import type { AgentTool } from "./types";

export const open_source: AgentTool<{ url: string; title?: string }> = {
  name: "open_source",
  description: "Opens an external web source or research paper URL in the Browser dock tab.",
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
