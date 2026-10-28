import { z } from "zod";
import type { AgentTool } from "./types";
import { PluginService } from "../../services/pluginService";

export interface CreatePluginArgs {
  id: string;
  name: string;
  description: string;
  icon?: string;
  code: string;
  workspaceId?: string;
  idempotencyKey?: string;
  capabilities?: Array<{
    id: string;
    title: string;
    description: string;
    risk?: "read" | "write" | "destructive" | "external";
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
    idempotencyKey: z
      .string()
      .optional()
      .describe("Optional idempotency key to prevent duplicate creation on retry"),
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

    return await PluginService.synthesizePlugin({
      id: args.id,
      name: args.name,
      description: args.description,
      icon: args.icon,
      code: args.code,
      workspaceId,
      capabilities: args.capabilities,
      actor: "agent",
      idempotencyKey: args.idempotencyKey,
    });
  },
};
