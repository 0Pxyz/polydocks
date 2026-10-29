import { z } from "zod";
import type { AgentTool } from "./types";
import { PluginService } from "../../services/pluginService";
import { normalizePluginId, verifyPluginStateAsync } from "../../plugins/verify";
import { readFeature } from "../../workspace/features";

export interface ModifyPluginArgs {
  id: string;
  code?: string;
  patch?: { find: string; replace: string; replaceAll?: boolean };
  changeSummary: string;
  name?: string;
  description?: string;
  icon?: string;
  workspaceId?: string;
}

const patchSchema = z
  .object({
    find: z.string().min(1).describe("Exact source substring to find"),
    replace: z.string().describe("Replacement text"),
    replaceAll: z.boolean().optional().default(false).describe("Replace every occurrence (default first only)"),
  })
  .describe("Surgical source patch applied to the current source (fix = inspect -> patch -> verify)");

export const modify_plugin: AgentTool<ModifyPluginArgs> = {
  name: "modify_plugin",
  description:
    "Modifies an existing plugin in-place without duplicating dock entries or destroying saved user data. Fix flow: inspect_experience -> patch (patch {find, replace} or full code or metadata-only) -> verify. Never recreate the plugin id.",
  schema: z
    .object({
      id: z
        .string()
        .regex(/^[a-z0-9_-]+$/)
        .describe("ID of the existing plugin to modify"),
      code: z
        .string()
        .min(10)
        .optional()
        .describe(
          "Full replacement TSX code. Import allowlist: react, react-dom/client, @/components/ui/* only."
        ),
      patch: patchSchema.optional(),
      changeSummary: z
        .string()
        .min(1)
        .describe("Clear explanation of what was changed, added, or fixed"),
      name: z.string().optional().describe("Optional updated display name"),
      description: z.string().optional().describe("Optional updated description"),
      icon: z.string().optional().describe("Optional updated Phosphor icon name"),
      workspaceId: z.string().optional().describe("Workspace where plugin is located"),
    })
    .superRefine((data, ctx) => {
      if (!data.code && !data.patch && !data.name && !data.description && !data.icon) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "modify_plugin requires at least one of: code, patch, name, description, icon",
        });
      }
      if (data.code && data.patch) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Provide either code (full replace) or patch (surgical edit), not both",
        });
      }
    }),
  execute: async (args, ctx) => {
    const workspaceId = args.workspaceId || ctx?.workspaceId || ctx?.cityId || "default";
    const normalized = normalizePluginId(args.id);

    // Surgical patch path: apply find/replace to the current source so small
    // fixes do not require resending the whole file.
    if (args.patch) {
      let current;
      try {
        current = await readFeature(workspaceId, normalized);
      } catch {
        return {
          success: false,
          error: `Plugin "${normalized}" not found in workspace "${workspaceId}". Use create_plugin to create a new tool.`,
        };
      }
      if (!current.code) {
        return {
          success: false,
          error: `Plugin "${normalized}" has no editable source (legacy HTML). Provide full code to migrate it.`,
        };
      }
      const occurrences = current.code.split(args.patch.find).length - 1;
      if (occurrences === 0) {
        return {
          success: false,
          error: `Patch target not found in "${normalized}": no occurrence of the given 'find' string. Re-inspect the source and retry.`,
        };
      }
      const patched = args.patch.replaceAll
        ? current.code.split(args.patch.find).join(args.patch.replace)
        : current.code.replace(args.patch.find, args.patch.replace);
      const updated = await PluginService.modifyPlugin({
        id: normalized,
        code: patched,
        changeSummary: args.changeSummary,
        name: args.name,
        description: args.description,
        icon: args.icon,
        workspaceId,
        actor: "agent",
      });
      if (!updated.success) return updated;
      const verification = await verifyPluginStateAsync(normalized, workspaceId);
      if (!verification.ok) {
        return {
          success: false,
          error: verification.error || "Plugin verification failed after patch",
          verification,
          pluginId: normalized,
        };
      }
      return { ...updated, verification };
    }

    // Metadata-only path (no code): keep existing source/srcdoc, update manifest.
    if (!args.code) {
      let current;
      try {
        current = await readFeature(workspaceId, normalized);
      } catch {
        return {
          success: false,
          error: `Plugin "${normalized}" not found in workspace "${workspaceId}". Use create_plugin to create a new tool.`,
        };
      }
      const manifest = { ...current.manifest };
      if (args.name) manifest.title = args.name;
      if (args.icon) manifest.icon = args.icon;
      manifest.updatedAt = new Date().toISOString();
      // Preserve the existing source so future patches keep working.
      const { upsertPluginFile } = await import("../../workspace/pluginFiles");
      upsertPluginFile({
        workspaceId,
        pluginId: normalized,
        version: (manifest as { version?: string }).version || "1.0.0",
        manifest,
        sourceCode: current.code,
        srcdoc: current.srcdoc,
      });
      const { ensurePluginRegisteredAndMounted } = await import("../../plugins/verify");
      ensurePluginRegisteredAndMounted(normalized, workspaceId, manifest);
      const verification = await verifyPluginStateAsync(normalized, workspaceId);
      if (!verification.ok) {
        return {
          success: false,
          error: verification.error || "Plugin verification failed after metadata update",
          verification,
          pluginId: normalized,
        };
      }
      return {
        success: true,
        pluginId: normalized,
        name: manifest.title,
        workspaceId,
        action: "dock.tool_updated",
        changeSummary: args.changeSummary,
        verification,
      };
    }

    const updated = await PluginService.modifyPlugin({
      id: normalized,
      code: args.code,
      changeSummary: args.changeSummary,
      name: args.name,
      description: args.description,
      icon: args.icon,
      workspaceId,
      actor: "agent",
    });
    if (!updated.success) return updated;

    const verification = await verifyPluginStateAsync(normalized, workspaceId);
    if (!verification.ok) {
      return {
        success: false,
        error: verification.error || "Plugin verification failed after modify",
        verification,
        pluginId: normalized,
      };
    }
    return { ...updated, verification };
  },
};
