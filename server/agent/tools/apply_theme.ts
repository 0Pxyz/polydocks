import { z } from "zod";
import type { AgentTool } from "./types";

export interface ApplyThemeArgs {
  wallpaperUrl?: string;
  attachmentId?: string;
  theme?: "void" | "cyber" | "amber" | "amethyst";
  accentColor?: string;
  wallpaperFit?: "cover" | "contain" | "tile";
  wallpaperOpacity?: number;
  wallpaperBlur?: number;
  dockStyle?: "glass" | "solid" | "bare" | "lift";
  dockPosition?: "top" | "bottom";
  clearWallpaper?: boolean;
}

const urlOrDataUrl = z
  .string()
  .min(1)
  .refine(
    (v) => v.startsWith("https://") || v.startsWith("http://") || v.startsWith("data:image/"),
    { message: "wallpaperUrl must be an http(s) URL or a data:image/ URL" }
  );

export const apply_theme: AgentTool<ApplyThemeArgs> = {
  name: "apply_theme",
  description:
    "Applies a theme change to the Polymax UI: wallpaper/background image (by attachmentId for user-attached images, or wallpaperUrl for remote images), base theme id, custom accent color, wallpaper fit/opacity/blur, dock style or position. Use for ALL appearance change requests. Never use web research for theme edits.",
  schema: z
    .object({
      wallpaperUrl: urlOrDataUrl.optional().describe("Remote https:// image URL for the wallpaper"),
      attachmentId: z
        .string()
        .min(1)
        .optional()
        .describe("ID of a user-attached image from this conversation to use as the wallpaper"),
      theme: z.enum(["void", "cyber", "amber", "amethyst"]).optional().describe("Base theme id"),
      accentColor: z
        .string()
        .regex(/^#([0-9a-fA-F]{6})$/, "accentColor must be a #rrggbb hex color")
        .optional()
        .describe("Custom accent color as #rrggbb"),
      wallpaperFit: z.enum(["cover", "contain", "tile"]).optional(),
      wallpaperOpacity: z.number().min(0.05).max(1).optional(),
      wallpaperBlur: z.number().min(0).max(30).optional(),
      dockStyle: z.enum(["glass", "solid", "bare", "lift"]).optional(),
      dockPosition: z.enum(["top", "bottom"]).optional(),
      clearWallpaper: z.boolean().optional().describe("Remove the current wallpaper"),
    })
    .superRefine((data, ctx) => {
      const hasAction =
        data.wallpaperUrl !== undefined ||
        data.attachmentId !== undefined ||
        data.theme !== undefined ||
        data.accentColor !== undefined ||
        data.wallpaperFit !== undefined ||
        data.wallpaperOpacity !== undefined ||
        data.wallpaperBlur !== undefined ||
        data.dockStyle !== undefined ||
        data.dockPosition !== undefined ||
        data.clearWallpaper === true;
      if (!hasAction) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "apply_theme requires at least one theme field to change",
        });
      }
    }),
  execute: async (args) => {
    const applied: Record<string, unknown> = {};
    if (args.wallpaperUrl !== undefined) applied.wallpaperUrl = args.wallpaperUrl;
    if (args.theme !== undefined) applied.theme = args.theme;
    if (args.accentColor !== undefined) applied.accentColor = args.accentColor;
    if (args.wallpaperFit !== undefined) applied.wallpaperFit = args.wallpaperFit;
    if (args.wallpaperOpacity !== undefined) applied.wallpaperOpacity = args.wallpaperOpacity;
    if (args.wallpaperBlur !== undefined) applied.wallpaperBlur = args.wallpaperBlur;
    if (args.dockStyle !== undefined) applied.dockStyle = args.dockStyle;
    if (args.dockPosition !== undefined) applied.dockPosition = args.dockPosition;
    if (args.clearWallpaper === true) applied.clearWallpaper = true;

    return {
      success: true,
      action: "theme.apply",
      applied,
      ...(args.attachmentId !== undefined ? { attachmentId: args.attachmentId } : {}),
      message: `Theme update validated for the UI to apply: ${Object.keys(applied).join(", ")}.`,
    };
  },
};
