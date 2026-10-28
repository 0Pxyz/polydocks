import { z } from "zod";
import type { AgentTool } from "./types";
import { PluginRegistry } from "../../plugins/registry";
import type { PluginManifest } from "../../plugins/manifest";
import { writeFeature, readFeature } from "../../workspace/features";

export interface ModifyPluginArgs {
  id: string;
  code: string;
  changeSummary: string;
  name?: string;
  description?: string;
  icon?: string;
  workspaceId?: string;
}

function bumpPatchVersion(version: string): string {
  const parts = version.split(".");
  if (parts.length >= 3) {
    const patch = parseInt(parts[2], 10);
    if (!Number.isNaN(patch)) {
      return `${parts[0]}.${parts[1]}.${patch + 1}`;
    }
  }
  return `${version}.1`;
}

export const modify_plugin: AgentTool<ModifyPluginArgs> = {
  name: "modify_plugin",
  description:
    "Modifies an existing plugin in-place without duplicating dock entries or destroying existing saved user data. Updates code, bumps version, and preserves storage keys.",
  schema: z.object({
    id: z
      .string()
      .regex(/^[a-z0-9_-]+$/)
      .describe("ID of the existing plugin to modify"),
    code: z
      .string()
      .min(10)
      .describe(
        "Updated self-contained TypeScript/JavaScript code for the plugin UI. Forbidden from external imports. Uses window.polydocks.storage for state."
      ),
    changeSummary: z
      .string()
      .min(1)
      .describe("Clear explanation of what was changed, added, or fixed"),
    name: z.string().optional().describe("Optional updated display name"),
    description: z.string().optional().describe("Optional updated description"),
    icon: z.string().optional().describe("Optional updated Phosphor icon name"),
    workspaceId: z.string().optional().describe("Workspace where plugin is located"),
  }),
  execute: async (args, ctx) => {
    const workspaceId = args.workspaceId || ctx?.workspaceId || ctx?.cityId || "default";
    const pluginId = args.id.toLowerCase().trim();

    const registry = PluginRegistry.getInstance();
    const existingPlugin = registry.get(pluginId);
    const existingFeature = await readFeature(workspaceId, pluginId);

    if (!existingPlugin && !existingFeature) {
      return {
        success: false,
        error: `Plugin "${pluginId}" not found in workspace "${workspaceId}". Use create_plugin to create a new tool.`,
      };
    }

    const currentVersion = existingPlugin?.version || "1.0.0";
    const nextVersion = bumpPatchVersion(currentVersion);
    const name = args.name || existingPlugin?.name || existingFeature?.manifest.title || pluginId;
    const description =
      args.description || existingPlugin?.manifest.description || "Updated synthesized plugin";
    const icon = args.icon || existingPlugin?.manifest.icon || existingFeature?.manifest.icon || "Cards";

    const updatedFeatureManifest = {
      ...existingFeature?.manifest,
      id: pluginId,
      title: name,
      icon,
      scope: "workspace",
      workspaceId,
      version: nextVersion,
      updatedAt: new Date().toISOString(),
    };

    // 1. Write the updated feature module in-place
    await writeFeature(workspaceId, pluginId, {
      manifest: updatedFeatureManifest,
      code: args.code,
    });

    // 2. Update manifest in PluginRegistry
    const updatedManifest: PluginManifest = {
      apiVersion: 1,
      id: pluginId,
      name,
      version: nextVersion,
      description,
      icon,
      trust: existingPlugin?.trust || "generated",
      capabilities: existingPlugin?.manifest.capabilities || [],
      surfaces: [
        {
          id: pluginId,
          title: name,
          icon,
          variant: "immersive",
          entry: `features/${pluginId}`,
        },
      ],
      permissions: existingPlugin?.manifest.permissions || [],
    };

    const installResult = registry.install(updatedManifest);
    if (!installResult.success) {
      return {
        success: false,
        error: installResult.error || "Failed to update plugin manifest in registry",
      };
    }

    return {
      success: true,
      pluginId,
      name,
      workspaceId,
      previousVersion: currentVersion,
      version: nextVersion,
      changeSummary: args.changeSummary,
      action: "dock.tool_updated",
      message: `Plugin "${name}" updated to v${nextVersion}. ${args.changeSummary}`,
    };
  },
};
