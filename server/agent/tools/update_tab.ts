import { z } from "zod";
import type { AgentTool } from "./types";
import { readCityFile, writeCityFile } from "../../workspace/cityWorkspace";

export const update_tab: AgentTool<{
  id: string;
  title?: string;
  icon?: string;
  html?: string;
  cityId?: string;
}> = {
  name: "update_tab",
  description: "Updates the HTML content or metadata of an existing dynamic dock tool tab.",
  schema: z.object({
    id: z.string().describe("Target tab id to update"),
    title: z.string().optional(),
    icon: z.string().optional(),
    html: z.string().optional(),
    cityId: z.string().optional(),
  }),
  execute: async (args, ctx) => {
    const targetCity = args.cityId || ctx.cityId;
    if (!targetCity) {
      throw new Error("Cannot update a tab without an active city workspace scope.");
    }

    const manifestRaw = await readCityFile(targetCity, `tabs/${args.id}/manifest.json`);
    const manifest = JSON.parse(manifestRaw);

    if (args.title) manifest.title = args.title;
    if (args.icon) manifest.icon = args.icon;
    manifest.updatedAt = new Date().toISOString();

    await writeCityFile(targetCity, `tabs/${args.id}/manifest.json`, JSON.stringify(manifest, null, 2));

    if (args.html) {
      await writeCityFile(targetCity, `tabs/${args.id}/index.html`, args.html);
    }

    return {
      success: true,
      tab: manifest,
      cityId: targetCity,
      action: "tab.updated",
    };
  },
};
