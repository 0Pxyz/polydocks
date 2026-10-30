import { z } from "zod";
import type { AgentTool } from "./types";
import { writeLegacyFeature, writeFeature } from "../../workspace/features";
import { isPluginIdTaken, normalizePluginId, verifyPluginStateAsync, ensurePluginRegisteredAndMounted } from "../../plugins/verify";
import { isValidIconId, findCloseMatches } from "../../icons/catalog";

export interface CreateTabArgs {
  id: string;
  title: string;
  icon?: string;
  code?: string;
  html?: string;
  scope?: "city" | "global";
  cityId?: string;
  capabilities?: string[];
  permissions?: any[];
}

export const create_tab: AgentTool<CreateTabArgs> = {
  name: "create_tab",
  description:
    "Builds a new city-scoped tab (TSX code or legacy html, exactly one). Use only for a tool the user wants to come back to; do not use for persistent workspace tools (use create_plugin) or to fix an existing tab (use update_tab). UI must look native: theme tokens only, no bordered cards, no separators, no decorative pills, sentence case (docs/design-slop.md).",
  schema: z
    .object({
      id: z
        .string()
        .regex(
          /^[a-z0-9_-]+$/,
          "Tab id must contain only lowercase letters, numbers, hyphens or underscores"
        ),
      title: z.string().min(1).describe("Human-readable title shown on the dock icon / header"),
      icon: z
        .string()
        .optional()
        .default("layers")
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
          "Dock icon id from the renderable icon catalog (e.g. cards, atom, code, stack, scales). Call search_icons to discover valid ids; unknown ids are rejected."
        ),
      code: z
        .string()
        .optional()
        .describe(
          "TSX feature module. Import allowlist: react, react-dom/client, @/components/ui/* only; mounts into #app via window.polymax bridge"
        ),
      html: z
        .string()
        .optional()
        .describe("Complete self-contained HTML/CSS/JS document rendered in the sandbox (legacy format)"),
      scope: z.enum(["city", "global"]).default("city"),
      cityId: z.string().optional().describe("City identifier to mount the tab inside"),
      capabilities: z
        .array(z.string())
        .optional()
        .describe("Declared bridge capability IDs this experience is permitted to invoke"),
      permissions: z.array(z.any()).optional().describe("Declared granular permissions"),
    })
    .refine((data) => Boolean(data.code || data.html), {
      message: "Either 'code' (TypeScript feature module) or 'html' (legacy document) must be provided.",
    }),
  execute: async (args, ctx) => {
    const targetCity = args.cityId || ctx.cityId || (args.scope === "global" ? "global" : args.id);

    // Update-instead-of-recreate guard: normalized id checked across
    // registry + tab/plugin namespaces in every scope, not just this city.
    const normalized = normalizePluginId(args.id);
    const taken = isPluginIdTaken(normalized);
    if (taken.taken) {
      return {
        success: false,
        error: `Tab "${normalized}" already exists (${taken.namespaces.join(", ")}). Use update_tab to modify the existing experience instead of recreating it.`,
      };
    }

    const manifest = {
      id: normalized,
      title: args.title,
      icon: (args.icon || "layers").toLowerCase().trim(),
      scope: args.scope || "city",
      capabilities: args.capabilities || [],
      permissions: args.permissions || [],
      createdAt: new Date().toISOString(),
    };

    if (args.code) {
      // Modern feature module path
      await writeFeature(targetCity, normalized, {
        manifest,
        code: args.code,
      });

      ensurePluginRegisteredAndMounted(normalized, targetCity, manifest);
      const verification = await verifyPluginStateAsync(normalized, targetCity);
      if (!verification.ok) {
        return {
          success: false,
          error: verification.error || "Tab verification failed after create",
          verification,
          tab: manifest,
          cityId: targetCity,
        };
      }
      return {
        success: true,
        tab: manifest,
        cityId: targetCity,
        action: "tab.created",
        format: "feature-ts",
        verification,
      };
    }

    // Legacy HTML blob path (SQLite single source of truth, no FS mirroring)
    const rawHtml = args.html || "";
    await writeLegacyFeature(targetCity, normalized, manifest, rawHtml);

    ensurePluginRegisteredAndMounted(normalized, targetCity, manifest);
    const verification = await verifyPluginStateAsync(normalized, targetCity);
    if (!verification.ok) {
      return {
        success: false,
        error: verification.error || "Tab verification failed after create",
        verification,
        tab: manifest,
        cityId: targetCity,
      };
    }
    return {
      success: true,
      tab: manifest,
      cityId: targetCity,
      action: "tab.created",
      format: "legacy-html",
      verification,
    };
  },
};
