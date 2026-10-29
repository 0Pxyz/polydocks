import { z } from "zod";
import type { AgentTool } from "./types";

export const open_tab: AgentTool<{ tabId: string; cityId?: string }> = {
  name: "open_tab",
  description: "Focuses an already-mounted dock tab by id. Use to show something existing; do not use for web links or fresh content (use open_source or open_intent). City content requires the city scope: enter the city first with enter_city (or pass its cityId) — without it the tab opens in the global scope and shows nothing from the city.",
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
