import { z } from "zod";
import type { AgentTool } from "./types";
import { PluginRegistry } from "../../plugins/registry";
import type { PluginManifest } from "../../plugins/manifest";
import { writeFeature } from "../../workspace/features";
import { addPluginToWorkspace } from "../../workspace/workspaces";

export interface CreatePluginArgs {
  id: string;
  name: string;
  description: string;
  icon?: string;
  code: string;
  workspaceId?: string;
  capabilities?: Array<{
    id: string;
    title: string;
    description: string;
    risk?: "read" | "write" | "exec" | "network";
    input?: Record<string, unknown>;
  }>;
}

export const create_plugin: AgentTool<CreatePluginArgs> = {
  name: "create_plugin",
  description:
    "Synthesizes and mounts a new software plugin / micro-app directly into the persistent PolyDocks workspace dock. Code must be self-contained TypeScript/JavaScript interacting with window.polydocks / window.polymax bridge.",
  schema: z.object({
    id: z
      .string()
      .regex(
        /^[a-z0-9_-]+$/,
        "Plugin ID must contain only lowercase alphanumeric characters, hyphens, or underscores"
      )
      .describe("Unique slug for the plugin (e.g. 'pomodoro-timer', 'kanban-board')"),
    name: z.string().min(1).describe("Human-readable title displayed in the dock and header"),
    description: z.string().min(1).describe("Clear summary of the tool's purpose and functionality"),
    icon: z
      .string()
      .optional()
      .default("Cards")
      .describe("Phosphor icon name (e.g. 'Clock', 'Cards', 'Brain', 'Globe', 'Sparkle')"),
    code: z
      .string()
      .min(10)
      .describe(
        "Complete self-contained TypeScript/JavaScript code for the plugin UI. Forbidden from external imports. Uses window.polydocks.storage for state."
      ),
    workspaceId: z
      .string()
      .optional()
      .describe("Workspace to install into. Defaults to active workspace or 'default'"),
    capabilities: z
      .array(
        z.object({
          id: z.string(),
          title: z.string(),
          description: z.string(),
          risk: z.enum(["read", "write", "destructive", "external"]).default("read"),
          input: z.record(z.unknown()).optional(),
        })
      )
      .optional()
      .describe("Optional programmatic capabilities exposed to the agent or other tools"),
  }),
  execute: async (args, ctx) => {
    const workspaceId = args.workspaceId || ctx?.workspaceId || ctx?.cityId || "default";
    const pluginId = args.id.toLowerCase().trim();
    const icon = args.icon || "Cards";

    const featureManifest = {
      id: pluginId,
      title: args.name,
      icon,
      scope: "workspace",
      workspaceId,
      capabilities: args.capabilities?.map((c) => c.id) || [],
      createdAt: new Date().toISOString(),
    };

    // 1. Transpile and write the feature file safely (enforces no forbidden imports & size caps)
    await writeFeature(workspaceId, pluginId, {
      manifest: featureManifest,
      code: args.code,
    });

    // 2. Build and register the formal PluginManifest
    const manifestCapabilities = (args.capabilities || []).map((cap) => ({
      id: cap.id.includes(".") ? cap.id : `${pluginId}.${cap.id}`,
      title: cap.title,
      description: cap.description,
      risk: cap.risk || "read",
      input: cap.input || { type: "object" },
    }));

    const pluginManifest: PluginManifest = {
      apiVersion: 1,
      id: pluginId,
      name: args.name,
      version: "1.0.0",
      description: args.description,
      icon,
      trust: "generated",
      capabilities: manifestCapabilities,
      surfaces: [
        {
          id: pluginId,
          title: args.name,
          icon,
          variant: "immersive",
          entry: `features/${pluginId}`,
        },
      ],
      permissions: [],
    };

    const registry = PluginRegistry.getInstance();
    const installResult = registry.install(pluginManifest);
    if (!installResult.success) {
      return {
        success: false,
        error: installResult.error || "Failed to register plugin manifest",
      };
    }

    // 3. Mount into the active workspace dock
    const mounted = addPluginToWorkspace(workspaceId, pluginId);

    return {
      success: true,
      pluginId,
      name: args.name,
      workspaceId,
      version: "1.0.0",
      action: "dock.tool_mounted",
      message: `Plugin "${args.name}" successfully synthesized and mounted to workspace "${workspaceId}".`,
      mounted,
    };
  },
};
