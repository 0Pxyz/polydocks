import { z } from "zod";
import type { AgentTool } from "./types";
import { PluginService } from "../../services/pluginService";
import { isPluginIdTaken, normalizePluginId, verifyPluginStateAsync } from "../../plugins/verify";

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
    "Builds a new persistent workspace plugin (self-contained TSX). Use only for new durable tools; do not use to fix an existing plugin (use modify_plugin) or for city tabs (use create_tab).",
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
        "Complete TSX code for the plugin UI. Import allowlist: react, react-dom/client, @/components/ui/* only. Uses window.polydocks bridge (storage, useCapability, openContent)."
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

    // Retry safety: an idempotency key that already executed returns the
    // cached result before the duplicate guard (a retry is not a recreate).
    if (args.idempotencyKey && args.idempotencyKey.trim().length > 0) {
      try {
        const { db } = await import("../../workspace/db");
        const hit = db
          .query("SELECT response_json FROM idempotency_keys WHERE key = ?")
          .get(args.idempotencyKey.trim()) as any;
        if (hit?.response_json) {
          return JSON.parse(hit.response_json);
        }
      } catch {
        // Fall through to normal execution.
      }
    }

    // Update-instead-of-recreate guard: ids are normalized to lowercase and
    // checked across registry + tab/plugin namespaces in every scope.
    const normalized = normalizePluginId(args.id);
    const taken = isPluginIdTaken(normalized);
    if (taken.taken) {
      return {
        success: false,
        error: `Plugin "${normalized}" already exists (${taken.namespaces.join(", ")}). Use modify_plugin to update the existing plugin instead of recreating it.`,
      };
    }

    const created = await PluginService.synthesizePlugin({
      id: normalized,
      name: args.name,
      description: args.description,
      icon: args.icon,
      code: args.code,
      workspaceId,
      capabilities: args.capabilities,
      actor: "agent",
      idempotencyKey: args.idempotencyKey,
    });
    if (!created.success) return created;

    const verification = await verifyPluginStateAsync(normalized, workspaceId);
    if (!verification.ok) {
      return {
        success: false,
        error: verification.error || "Plugin verification failed after create",
        verification,
        pluginId: normalized,
      };
    }
    return { ...created, verification };
  },
};
