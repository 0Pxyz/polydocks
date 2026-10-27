import { z } from "zod";
import type { AgentTool } from "./types";
import { writeCityFile } from "../../workspace/cityWorkspace";

export const write_city_file: AgentTool<{
  path: string;
  content: string;
  cityId?: string;
}> = {
  name: "write_city_file",
  description: "Writes or creates a markdown note or document within the active city workspace.",
  schema: z.object({
    path: z.string().describe("Relative destination path inside the city folder (e.g. 'notes/summary.md')"),
    content: z.string().describe("Text or markdown content to write"),
    cityId: z.string().optional(),
  }),
  execute: async (args, ctx) => {
    const targetCity = args.cityId || ctx.cityId;
    if (!targetCity) {
      throw new Error("No cityId provided or active in context.");
    }

    const writtenPath = await writeCityFile(targetCity, args.path, args.content);
    return {
      success: true,
      path: args.path,
      cityId: targetCity,
      writtenPath,
    };
  },
};
