import { z } from "zod";
import type { AgentTool } from "./types";
import { readFeature, writeFeature, writeLegacyFeature } from "../../workspace/features";

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
    "Updates the TypeScript module, HTML content, or metadata of an existing dynamic dock tool tab.",
  schema: z.object({
    id: z.string().describe("Target tab id to update"),
    title: z.string().optional(),
    icon: z.string().optional(),
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

    const current = await readFeature(targetCity, args.id);
    const manifest = { ...current.manifest };

    if (args.title) manifest.title = args.title;
    if (args.icon) manifest.icon = args.icon;
    manifest.updatedAt = new Date().toISOString();

    if (args.code) {
      await writeFeature(targetCity, args.id, {
        manifest,
        code: args.code,
      });

      return {
        success: true,
        tab: manifest,
        cityId: targetCity,
        action: "tab.updated",
        format: "feature-ts",
      };
    }

    // Legacy HTML blob path (SQLite single source of truth)
    if (args.html) {
      await writeLegacyFeature(targetCity, args.id, manifest, args.html);
    } else {
      // Metadata-only update: persist manifest with existing srcdoc.
      await writeLegacyFeature(targetCity, args.id, manifest, current.srcdoc);
    }

    return {
      success: true,
      tab: manifest,
      cityId: targetCity,
      action: "tab.updated",
      format: current.format,
    };
  },
};
