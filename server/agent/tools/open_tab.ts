import { z } from "zod";
import type { AgentTool } from "./types";

export const open_tab: AgentTool<{ tabId: string; cityId?: string }> = {
  name: "open_tab",
  description: "Opens and focuses a specified tool tab in the Agentic Dock tray.",
  schema: z.object({
    tabId: z.string().describe("Identifier of the tab to open (e.g. 'browser', 'notes', or dynamic tab id)"),
    cityId: z.string().optional().describe("City workspace scope"),
  }),
  execute: async (args, ctx) => {
    return {
      success: true,
      tabId: args.tabId,
      cityId: args.cityId || ctx.cityId,
      action: "tray.open",
    };
  },
};
