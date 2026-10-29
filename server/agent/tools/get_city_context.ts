import { z } from "zod";
import type { AgentTool } from "./types";
import { getCityContext } from "../../workspace/cityWorkspace";

export const get_city_context: AgentTool<{ cityId?: string }> = {
  name: "get_city_context",
  description:
    "Reads city metadata, notes, sources, and tabs. Use only for explicit city-state asks; never on greetings, and never to read a single file (use read_city_file).",
  schema: z.object({
    cityId: z.string().optional().describe("City identifier; defaults to current active city"),
  }),
  execute: async (args, ctx) => {
    const targetCity = args.cityId || ctx.cityId;
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

    const context = await getCityContext(targetCity);
    return context;
  },
};
