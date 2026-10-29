import { z } from "zod";
import type { AgentTool } from "./types";
import { readFeature } from "../../workspace/features";
import { getExperienceErrors } from "../../workspace/experienceErrors";

export interface InspectExperienceArgs {
  id: string;
  cityId?: string;
}

export const inspect_experience: AgentTool<InspectExperienceArgs> = {
  name: "inspect_experience",
  description:
    "Reads back a tab or plugin's state, errors, and health. Use before writing any fix; never as an existence list (use list_tabs).",
  schema: z.object({
    id: z
      .string()
      .regex(/^[a-z0-9_-]+$/, "Experience ID must contain only lowercase alphanumeric characters, dashes, or underscores"),
    cityId: z.string().optional().describe("City identifier where the experience is stored (defaults to current city)"),
  }),
  execute: async (args, ctx) => {
    const targetCity = args.cityId || ctx.cityId || "global";

    const feature = await readFeature(targetCity, args.id);
    if (!feature) {
      return {
        success: false,
        error: `Experience "${args.id}" not found in city workspace "${targetCity}".`,
      };
    }

    const errors = getExperienceErrors(args.id, targetCity, 10);
    const sizeBytes = feature.code
      ? Buffer.byteLength(feature.code, "utf-8")
      : Buffer.byteLength(feature.srcdoc || "", "utf-8");

    return {
      success: true,
      experience: {
        id: feature.manifest.id,
        title: feature.manifest.title,
        icon: feature.manifest.icon || "Layers",
        format: feature.format,
        sizeBytes,
        capabilities: (feature.manifest.capabilities as string[]) || [],
        permissions: (feature.manifest.permissions as any[]) || [],
        errors,
        isHealthy: errors.length === 0,
      },
      cityId: targetCity,
    };
  },
};
