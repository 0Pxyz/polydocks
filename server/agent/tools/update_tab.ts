import { z } from "zod";
import type { AgentTool } from "./types";
import { readFeature, writeFeature, writeLegacyFeature } from "../../workspace/features";
import { normalizePluginId, verifyPluginStateAsync, ensurePluginRegisteredAndMounted } from "../../plugins/verify";
import { isValidIconId, findCloseMatches } from "../../icons/catalog";

export interface UpdateTabArgs {
  id: string;
  title?: string;
  icon?: string;
  code?: string;
  html?: string;
  cityId?: string;
}

export const update_tab: AgentTool<UpdateTabArgs> = {
  name: "update_tab",
  description:
    "Patches an existing dock tab in place. Use for any change to a tab; never create a duplicate tab to change one. UI must look native: theme tokens only, no bordered cards, no separators, no decorative pills, sentence case (docs/design-slop.md).",
  schema: z.object({
    id: z.string().describe("Target tab id to update"),
    title: z.string().optional(),
    icon: z
      .string()
      .optional()
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
      .describe("Dock icon id from the renderable icon catalog (see search_icons)"),
    code: z
      .string()
      .optional()
      .describe("Updated TypeScript feature module (.ts) code"),
    html: z.string().optional().describe("Updated HTML content (legacy format)"),
    cityId: z.string().optional(),
  }),
  execute: async (args, ctx) => {
    const targetCity = args.cityId || ctx.cityId;
    if (!targetCity) {
      throw new Error("Cannot update a tab without an active city workspace scope.");
    }
    const normalized = normalizePluginId(args.id);

    const current = await readFeature(targetCity, normalized);
    const manifest = { ...current.manifest };

    if (args.title) manifest.title = args.title;
    if (args.icon) manifest.icon = args.icon.toLowerCase().trim();
    manifest.updatedAt = new Date().toISOString();

    if (args.code) {
      await writeFeature(targetCity, normalized, {
        manifest,
        code: args.code,
      });

      ensurePluginRegisteredAndMounted(normalized, targetCity, manifest);
      const verification = await verifyPluginStateAsync(normalized, targetCity);
      if (!verification.ok) {
        return {
          success: false,
          error: verification.error || "Tab verification failed after update",
          verification,
          tab: manifest,
          cityId: targetCity,
        };
      }
      return {
        success: true,
        tab: manifest,
        cityId: targetCity,
        action: "tab.updated",
        format: "feature-ts",
        verification,
      };
    }

    // Legacy HTML blob path (SQLite single source of truth)
    if (args.html) {
      await writeLegacyFeature(targetCity, normalized, manifest, args.html);
    } else {
      // Metadata-only update: persist manifest with existing srcdoc.
      await writeLegacyFeature(targetCity, normalized, manifest, current.srcdoc);
    }

    ensurePluginRegisteredAndMounted(normalized, targetCity, manifest);
    const verification = await verifyPluginStateAsync(normalized, targetCity);
    if (!verification.ok) {
      return {
        success: false,
        error: verification.error || "Tab verification failed after update",
        verification,
        tab: manifest,
        cityId: targetCity,
      };
    }
    return {
      success: true,
      tab: manifest,
      cityId: targetCity,
      action: "tab.updated",
      format: current.format,
      verification,
    };
  },
};
