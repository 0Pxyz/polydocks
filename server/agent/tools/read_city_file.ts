import { z } from "zod";
import type { AgentTool } from "./types";
import { readCityFile } from "../../workspace/cityWorkspace";

export const read_city_file: AgentTool<{ path: string; cityId?: string }> = {
  name: "read_city_file",
  description: "Reads the content of a file within the active city workspace (e.g. notes/summary.md).",
  schema: z.object({
    path: z.string().describe("Relative path inside the city workspace (e.g. 'notes/intro.md')"),
    cityId: z.string().optional(),
  }),
  execute: async (args, ctx) => {
    const targetCity = args.cityId || ctx.cityId;
    if (!targetCity) {
      throw new Error("No cityId provided or active in context.");
    }

    const content = await readCityFile(targetCity, args.path);
    return {
      path: args.path,
      cityId: targetCity,
      content,
    };
  },
};
