import { z } from "zod";
import type { AgentTool } from "./types";
import { PluginService } from "../../services/pluginService";
import { isPluginIdTaken, normalizePluginId, verifyPluginStateAsync } from "../../plugins/verify";
import { isValidIconId, findCloseMatches } from "../../icons/catalog";

export interface CreatePluginArgs {
  id: string;
  name: string;
  description: string;
  icon?: string;
  code: string;
  workspaceId?: string;
  idempotencyKey?: string;
  userApproved?: boolean;
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
    "Builds a new persistent workspace plugin (self-contained TSX). Use only for new durable tools; do not use to fix an existing plugin (use modify_plugin) or for city tabs (use create_tab). UI must look native: kit components and theme tokens by default (React @/components/ui imports or vanilla px-* classes, skill plugins), sentence case (docs/design-slop.md).",
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
      .default("cards")
      .superRefine((val, ctx) => {
        if (!val) return;
        if (!isValidIconId(val)) {
          const matches = findCloseMatches(val, 4);
          const suggestion = matches.length > 0 ? ` Did you mean: ${matches.join(", ")}?` : "";
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Unknown icon '${val}'.${suggestion} Call search_icons to find a valid icon id.`,
          });
        }
      })
      .describe(
        "Dock icon id from the renderable icon catalog (e.g. clock, cards, brain, globe, sparkle). Call search_icons to discover valid ids; unknown ids are rejected."
      ),
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
    userApproved: z
      .boolean()
      .optional()
      .describe("Set true only after the user explicitly said yes (install policy is ask-by-default)"),
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

    // Install policy: agent writes need an explicit user yes.
    const { enforceInstallPolicy } = await import("../installPolicy");
    const denied = enforceInstallPolicy(ctx?.actor, (args as any).userApproved);
    if (denied) return denied;

    // Visual kit gate (agent-created code is validated strict).
    {
      const { validateSlop } = await import("../../plugins/slop");
      const report = validateSlop(args.code, { strict: ctx?.actor === "agent" });
      if (!report.ok) {
        return { success: false, error: `Design kit violation: ${report.errors.join("; ")}`, code: "slop_violation" };
      }
    }
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
      icon: (args.icon || "cards").toLowerCase().trim(),
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
