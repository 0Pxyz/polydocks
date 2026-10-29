import { z } from "zod";
import type { AgentTool } from "./types";
import { writeCityFile } from "../../workspace/cityWorkspace";

export const write_city_file: AgentTool<{
  path: string;
  content: string;
  cityId?: string;
}> = {
  name: "write_city_file",
  description: "Creates or overwrites one file in the city workspace. Use for city notes, feeds, and sources; do not use for agent-home files (use write_file).",
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
