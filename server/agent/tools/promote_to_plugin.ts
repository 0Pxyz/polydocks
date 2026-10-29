import { z } from "zod";
import type { AgentTool } from "./types";
import { readFeature } from "../../workspace/features";
import { pluginRegistry } from "../../plugins/registry";
import type { PluginManifest } from "../../plugins/manifest";

export interface PromoteToPluginArgs {
  id: string;
  cityId?: string;
  name?: string;
  version?: string;
  description?: string;
}

export const promote_to_plugin: AgentTool<PromoteToPluginArgs> = {
  name: "promote_to_plugin",
  description:
    "Makes a verified experience reusable across cities via the catalog. Use for proven tools only; do not use on unverified work.",
  schema: z.object({
    id: z
      .string()
      .regex(/^[a-z0-9_-]+$/, "Experience ID must contain only lowercase alphanumeric characters, dashes, or underscores"),
    cityId: z.string().optional().describe("City workspace where the experience was synthesized"),
    name: z.string().optional().describe("User-facing plugin name"),
    version: z
      .string()
      .regex(/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/, "Version must follow semantic versioning (e.g. 1.0.0)")
      .optional()
      .default("1.0.0"),
    description: z.string().optional().describe("Brief description of what the plugin provides"),
  }),
  execute: async (args, ctx) => {
    const targetCity = args.cityId || ctx.cityId || "global";

    const feature = await readFeature(targetCity, args.id);
    if (!feature) {
      return {
        success: false,
        error: `Cannot promote experience "${args.id}": not found in city workspace "${targetCity}".`,
      };
    }

    const pluginId = `gen_${args.id.toLowerCase().replace(/[^a-z0-9_-]/g, "_")}`;
    const pluginName = args.name || feature.manifest.title || args.id;
    const version = args.version || "1.0.0";
    const description =
      args.description || `Synthesized experience "${feature.manifest.title}" from ${targetCity}`;
    const icon = (feature.manifest.icon as string) || "PuzzlePiece";

    const capabilities = ((feature.manifest.capabilities as string[]) || []).map((capId) => {
      const fullId = capId.includes(".") ? capId : `${pluginId}.${capId}`;
      return {
        id: fullId,
        title: `${pluginName} ${capId}`,
        description: `Action ${capId} provided by promoted experience ${args.id}`,
        risk: "read" as const,
        input: { type: "object" },
      };
    });

    const manifest: PluginManifest = {
      apiVersion: 1,
      id: pluginId,
      name: pluginName,
      version,
      description,
      icon,
      trust: "generated",
      capabilities,
      surfaces: [
        {
          id: args.id,
          title: feature.manifest.title || args.id,
          icon,
          variant: "immersive",
          entry: `features/${args.id}`,
        },
      ],
      permissions: (feature.manifest.permissions as any[]) || [],
    };

    const installResult = pluginRegistry.install(manifest);
    if (!installResult.success || !installResult.plugin) {
      return {
        success: false,
        error: installResult.error || "Failed to register promoted plugin manifest in catalog.",
      };
    }

    return {
      success: true,
      pluginId,
      plugin: installResult.plugin,
      manifest,
      message: `Experience "${args.id}" was successfully promoted to reusable plugin "${pluginId}".`,
    };
  },
};
