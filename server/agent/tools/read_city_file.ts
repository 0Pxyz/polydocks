import { z } from "zod";
import type { AgentTool } from "./types";
import { capabilityBus } from "../../plugins/bus";

export const read_city_file: AgentTool<{ path: string; cityId?: string }> = {
  name: "read_city_file",
  description: "Reads one file from the city workspace. Use for city notes and sources; do not use for agent-home files (use read_file).",
  schema: z.object({
    path: z.string().describe("Relative path inside the city workspace (e.g. 'notes/intro.md')"),
    cityId: z.string().optional(),
  }),
  execute: async (args, ctx) => {
    // Thin alias over writing.read_file: one implementation, one audit trail.
    const { initializeFirstPartyPlugins } = await import("../../plugins/first-party/index");
    initializeFirstPartyPlugins();
    const targetCity = args.cityId || (ctx as any)?.cityId;
    if (!targetCity) {
      throw new Error("No cityId provided or active in context.");
    }

    const result = await capabilityBus.invoke("writing.read_file", { path: args.path }, {
      actor: "agent",
      cityId: targetCity,
      step: (ctx as any)?.step,
    });
    if (!result.success) {
      throw new Error(result.error || `Cannot read "${args.path}" in city "${targetCity}".`);
    }
    const data = result.data as any;
    return {
      path: args.path,
      cityId: targetCity,
      content: typeof data?.content === "string" ? data.content : String(data ?? ""),
    };
  },
};
