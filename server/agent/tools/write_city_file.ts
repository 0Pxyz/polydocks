import { z } from "zod";
import type { AgentTool } from "./types";
import { capabilityBus } from "../../plugins/bus";

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
    // Thin alias over writing.write_file: one implementation, one audit trail.
    const { initializeFirstPartyPlugins } = await import("../../plugins/first-party/index");
    initializeFirstPartyPlugins();
    const targetCity = args.cityId || (ctx as any)?.cityId;
    if (!targetCity) {
      throw new Error("No cityId provided or active in context.");
    }

    const result = await capabilityBus.invoke("writing.write_file", {
      path: args.path,
      content: args.content,
    }, {
      actor: "agent",
      cityId: targetCity,
      step: (ctx as any)?.step,
    });
    if (!result.success) {
      return {
        success: false,
        path: args.path,
        cityId: targetCity,
        error: result.error,
      };
    }
    return {
      success: true,
      path: args.path,
      cityId: targetCity,
      writtenPath: (result.data as any)?.path || args.path,
    };
  },
};
