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
    "Applies a theme change to the Polydocks UI: wallpaper/background image (by attachmentId for user-attached images, or wallpaperUrl for remote images), base theme id, custom accent color, wallpaper fit/opacity/blur, dock style or position. Remote wallpaper URLs are verified to load as images before anything applies (unreachable or non-image URLs fail clearly with nothing changed). If only a wallpaper is given without theme/accent, the UI auto-complements the theme from the image; specify theme/accent explicitly to override. Use for ALL appearance change requests. Never use web research for theme edits.",
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
    if (args.wallpaperUrl !== undefined) {
      const { validateUrlForSsrf } = await import("../../plugins/ssrf");
      const verdict = validateUrlForSsrf(args.wallpaperUrl);
      if (!verdict.safe) {
        return {
          success: false,
          error: `Wallpaper URL rejected: ${verdict.reason}`,
          retryable: false,
          code: "unsafe_url",
        };
      }
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        let res: Response;
        try {
          // GET, not HEAD (many image hosts reject HEAD). The body is
          // cancelled as soon as headers arrive; only metadata crosses.
          res = await fetch(args.wallpaperUrl, { signal: controller.signal, redirect: "follow" });
        } catch (err: any) {
          clearTimeout(timer);
          const reason = err?.name === "AbortError" ? "timed out after 8s" : err?.message || String(err);
          return {
            success: false,
            error: `Wallpaper URL could not be loaded (${reason}) — nothing was changed.`,
            retryable: true,
            code: "wallpaper_unreachable",
          };
        }
        clearTimeout(timer);
        try {
          await res.body?.cancel();
        } catch {
          // Best-effort socket release.
        }
        if (!res.ok) {
          return {
            success: false,
            error: `Wallpaper URL returned HTTP ${res.status} — nothing was changed.`,
            retryable: true,
            code: "wallpaper_unreachable",
          };
        }
        const contentType = res.headers.get("content-type") || "";
        if (!/^image\//.test(contentType)) {
          return {
            success: false,
            error: `Wallpaper URL is not an image (content-type: ${contentType || "unknown"}) — nothing was changed.`,
            retryable: false,
            code: "wallpaper_not_image",
          };
        }
        applied.wallpaperContentType = contentType.split(";")[0];
      } catch (err: any) {
        return {
          success: false,
          error: `Wallpaper check failed (${err?.message || String(err)}) — nothing was changed.`,
          retryable: true,
          code: "wallpaper_unreachable",
        };
      }
      applied.wallpaperUrl = args.wallpaperUrl;
    }
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
