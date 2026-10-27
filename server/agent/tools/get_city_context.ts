import { z } from "zod";
import type { AgentTool } from "./types";
import { getCityContext } from "../../workspace/cityWorkspace";

export const get_city_context: AgentTool<{ cityId?: string }> = {
  name: "get_city_context",
  description:
    "Retrieves the active city workspace context, including metadata, notes, sources, and dynamic tabs.",
  schema: z.object({
    cityId: z.string().optional().describe("City identifier; defaults to current active city"),
  }),
  execute: async (args, ctx) => {
    const targetCity = args.cityId || ctx.cityId;
    if (!targetCity) {
      throw new Error("No cityId provided or active in context.");
    }

    const context = await getCityContext(targetCity);
    return context;
  },
};
