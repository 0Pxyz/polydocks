import { z } from "zod";
import type { AgentTool } from "./types";
import { writeCityFile } from "../../workspace/cityWorkspace";

export const create_tab: AgentTool<{
  id: string;
  title: string;
  icon?: string;
  html: string;
  scope?: "city" | "global";
  cityId?: string;
}> = {
  name: "create_tab",
  description:
    "Synthesizes and mounts a new dynamic tool tab into the Dock tray as self-contained HTML/CSS/JS.",
  schema: z.object({
    id: z.string().regex(/^[a-z0-9_-]+$/, "Tab id must contain only lowercase letters, numbers, hyphens or underscores"),
    title: z.string().min(1).describe("Human-readable title shown on the dock icon / header"),
    icon: z.string().default("Layers").describe("Lucide icon name (e.g. Layers, Scale, Bookmark)"),
    html: z.string().min(10).describe("Complete self-contained HTML/CSS/JS document rendered in the sandbox"),
    scope: z.enum(["city", "global"]).default("city"),
    cityId: z.string().optional().describe("City identifier to mount the tab inside"),
  }),
  execute: async (args, ctx) => {
    const targetCity = args.cityId || ctx.cityId;
    if (!targetCity) {
      throw new Error("Cannot create a tab without an active city workspace scope.");
    }

    const manifest = {
      id: args.id,
      title: args.title,
      icon: args.icon || "Layers",
      scope: args.scope || "city",
      createdAt: new Date().toISOString(),
    };

    // Persist manifest and HTML code in workspace/<city>/tabs/<tabId>/
    await writeCityFile(targetCity, `tabs/${args.id}/manifest.json`, JSON.stringify(manifest, null, 2));
    await writeCityFile(targetCity, `tabs/${args.id}/index.html`, args.html);

    return {
      success: true,
      tab: manifest,
      cityId: targetCity,
      action: "tab.created",
    };
  },
};
