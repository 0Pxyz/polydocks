import { z } from "zod";
import type { AgentTool } from "./types";
import { readFeature } from "../../workspace/features";
import { getExperienceErrors } from "../../workspace/experienceErrors";
import { listVersions } from "../../plugins/versions";
import { verifyPluginStateAsync, normalizePluginId } from "../../plugins/verify";
import { db } from "../../workspace/db";

export interface InspectExperienceArgs {
  id: string;
  cityId?: string;
  includeSource?: boolean;
}

export const inspect_experience: AgentTool<InspectExperienceArgs> = {
  name: "inspect_experience",
  description:
    "Inspects a synthesized experience or dock tool: source files, current version, version history, mounted workspaces, verification state, errors. Fix flow is inspect -> patch (modify_plugin with patch or code) -> verify.",
  schema: z.object({
    id: z
      .string()
      .regex(/^[a-z0-9_-]+$/, "Experience ID must contain only lowercase alphanumeric characters, dashes, or underscores"),
    cityId: z.string().optional().describe("City identifier where the experience is stored (defaults to current city)"),
    includeSource: z
      .boolean()
      .optional()
      .default(true)
      .describe("Include the current source code in the response (default true)"),
  }),
  execute: async (args, ctx) => {
    const targetCity = args.cityId || ctx.cityId || ctx.workspaceId || "global";
    const id = normalizePluginId(args.id);

    let feature;
    try {
      feature = await readFeature(targetCity, id);
    } catch {
      return {
        success: false,
        error: `Experience "${id}" not found in workspace "${targetCity}".`,
      };
    }
    if (!feature) {
      return {
        success: false,
        error: `Experience "${id}" not found in workspace "${targetCity}".`,
      };
    }

    const errors = getExperienceErrors(id, targetCity, 10);
    const sizeBytes = feature.code
      ? Buffer.byteLength(feature.code, "utf-8")
      : Buffer.byteLength(feature.srcdoc || "", "utf-8");

    let versionHistory: Array<{ version: string; status: string; createdAt: string }> = [];
    try {
      versionHistory = listVersions(id).map((v) => ({
        version: v.version,
        status: v.status,
        createdAt: v.createdAt,
      }));
    } catch {
      // versions table may be unavailable in ancient flows
    }

    let mountedWorkspaces: Array<{ workspaceId: string; enabled: boolean }> = [];
    try {
      const rows = db
        .query<{ workspace_id: string; enabled: number }, [string]>(
          `SELECT workspace_id, enabled FROM workspace_plugins WHERE plugin_id = ?`
        )
        .all(id);
      mountedWorkspaces = rows.map((r) => ({
        workspaceId: r.workspace_id,
        enabled: Boolean(r.enabled),
      }));
    } catch {
      // ignore
    }

    let verification: unknown = null;
    try {
      verification = await verifyPluginStateAsync(id, targetCity);
    } catch {
      // ignore
    }

    return {
      success: true,
      experience: {
        id: feature.manifest.id,
        title: feature.manifest.title,
        icon: feature.manifest.icon || "Layers",
        format: feature.format,
        sizeBytes,
        currentVersion: (feature.manifest as { version?: string }).version || "1.0.0",
        capabilities: (feature.manifest.capabilities as string[]) || [],
        permissions: (feature.manifest.permissions as any[]) || [],
        errors,
        isHealthy: errors.length === 0,
        versionHistory,
        mountedWorkspaces,
        verification,
      },
      files: {
        manifest: feature.manifest,
        ...(args.includeSource === false ? {} : { source: feature.code ?? null }),
        srcdocBytes: Buffer.byteLength(feature.srcdoc || "", "utf-8"),
      },
      cityId: targetCity,
      fixHint: "Fix without recreating: modify_plugin with { patch: { find, replace } } or full code, then verify.",
    };
  },
};
