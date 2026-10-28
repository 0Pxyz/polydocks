import { z } from "zod";
import type { AgentTool } from "./types";
import { writeCityFile } from "../../workspace/cityWorkspace";
import { readFeature, writeFeature } from "../../workspace/features";

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

    // Mirror to both features/ and tabs/
    await writeCityFile(targetCity, `features/${args.id}/manifest.json`, JSON.stringify(manifest, null, 2));
    await writeCityFile(targetCity, `tabs/${args.id}/manifest.json`, JSON.stringify(manifest, null, 2));

    if (args.html) {
      await writeCityFile(targetCity, `features/${args.id}/index.html`, args.html);
      await writeCityFile(targetCity, `tabs/${args.id}/index.html`, args.html);
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
