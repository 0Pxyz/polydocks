import { z } from "zod";
import type { AgentTool } from "./types";
import { writeCityFile } from "../../workspace/cityWorkspace";
import { writeFeature } from "../../workspace/features";

export interface CreateTabArgs {
  id: string;
  title: string;
  icon?: string;
  code?: string;
  html?: string;
  scope?: "city" | "global";
  cityId?: string;
}

export const create_tab: AgentTool<CreateTabArgs> = {
  name: "create_tab",
  description:
    "Synthesizes and mounts a new dynamic tool tab into the Dock tray as a versioned TypeScript feature module or self-contained HTML/CSS/JS.",
  schema: z
    .object({
      id: z
        .string()
        .regex(
          /^[a-z0-9_-]+$/,
          "Tab id must contain only lowercase letters, numbers, hyphens or underscores"
        ),
      title: z.string().min(1).describe("Human-readable title shown on the dock icon / header"),
      icon: z.string().default("Layers").describe("Lucide icon name (e.g. Layers, Scale, Bookmark)"),
      code: z
        .string()
        .optional()
        .describe(
          "TypeScript feature module (.ts) without external imports, interacting via window.polymax bridge"
        ),
      html: z
        .string()
        .optional()
        .describe("Complete self-contained HTML/CSS/JS document rendered in the sandbox (legacy format)"),
      scope: z.enum(["city", "global"]).default("city"),
      cityId: z.string().optional().describe("City identifier to mount the tab inside"),
    })
    .refine((data) => Boolean(data.code || data.html), {
      message: "Either 'code' (TypeScript feature module) or 'html' (legacy document) must be provided.",
    }),
  execute: async (args, ctx) => {
    const targetCity = args.cityId || ctx.cityId || (args.scope === "global" ? "global" : args.id);

    const manifest = {
      id: args.id,
      title: args.title,
      icon: args.icon || "Layers",
      scope: args.scope || "city",
      createdAt: new Date().toISOString(),
    };

    if (args.code) {
      // Modern feature module path
      await writeFeature(targetCity, args.id, {
        manifest,
        code: args.code,
      });

      return {
        success: true,
        tab: manifest,
        cityId: targetCity,
        action: "tab.created",
        format: "feature-ts",
      };
    }

    // Legacy HTML blob path
    const rawHtml = args.html || "";
    await writeCityFile(targetCity, `tabs/${args.id}/manifest.json`, JSON.stringify(manifest, null, 2));
    await writeCityFile(targetCity, `tabs/${args.id}/index.html`, rawHtml);
    await writeCityFile(targetCity, `features/${args.id}/manifest.json`, JSON.stringify(manifest, null, 2));
    await writeCityFile(targetCity, `features/${args.id}/index.html`, rawHtml);

    return {
      success: true,
      tab: manifest,
      cityId: targetCity,
      action: "tab.created",
      format: "legacy-html",
    };
  },
};
