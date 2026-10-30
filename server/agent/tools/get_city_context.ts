import { z } from "zod";
import type { AgentTool } from "./types";
import { capabilityBus } from "../../plugins/bus";

export const get_city_context: AgentTool<{ cityId?: string }> = {
  name: "get_city_context",
  description:
    "Reads city metadata, notes, sources, and tabs. Use only for explicit city-state asks; never on greetings, and never to read a single file (use read_city_file).",
  schema: z.object({
    cityId: z.string().optional().describe("City identifier; defaults to current active city"),
  }),
  execute: async (args, ctx) => {
    // Thin alias over workspace.get_context: one implementation, one audit trail.
    const { initializeFirstPartyPlugins } = await import("../../plugins/first-party/index");
    initializeFirstPartyPlugins();
    const targetCity = args.cityId || (ctx as any)?.cityId;
    if (!targetCity) {
      return {
        cityId: "global",
        exists: false,
        files: [],
        notes: [],
        sources: [],
        dynamicTabs: [],
        message: "No specific city active in context; operating in global workspace.",
      };
    }

    const result = await capabilityBus.invoke("workspace.get_context", { cityId: targetCity }, {
      actor: "agent",
      cityId: targetCity,
      step: (ctx as any)?.step,
    });
    if (!result.success) {
      return {
        cityId: targetCity,
        exists: false,
        files: [],
        notes: [],
        sources: [],
        dynamicTabs: [],
        message: result.error || "City context unavailable.",
      };
    }
    return result.data;
  },
};
