import { z } from "zod";

/**
 * Agent tool: customize_theme
 * Enables the Meta AI dock agent to dynamically alter workspace aesthetics,
 * background wallpaper (images, GIFs), accent colors, and themes on user request.
 */
export const description =
  "Customize the workspace visual theme, set background wallpapers (image or GIF url), or modify the neon accent color.";

export const schema = z.object({
  theme: z
    .enum(["void", "cyber", "amber", "amethyst"])
    .optional()
    .describe("Preset base theme: void (lime), cyber (cyan), amber (gold), amethyst (purple)"),
  accentColor: z
    .string()
    .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
    .optional()
    .describe("Custom neon accent hex code (e.g. #00FF66, #FF007F, #00D2FF)"),
  wallpaperUrl: z
    .string()
    .url()
    .optional()
    .describe("URL of an image, GIF, or pattern for the workspace background"),
  wallpaperOpacity: z
    .number()
    .min(0.05)
    .max(1.0)
    .optional()
    .describe("Opacity of the wallpaper layer (0.05 to 1.0, default 0.25 for high contrast)"),
  wallpaperBlur: z
    .number()
    .min(0)
    .max(20)
    .optional()
    .describe("Blur radius in pixels for the background wallpaper"),
});

export type CustomizeThemeParams = z.infer<typeof schema>;

export async function execute(args: CustomizeThemeParams) {
  // Returns an action descriptor dispatched over SSE to the front-end runtime
  return {
    success: true,
    message: "Theme customized successfully",
    applied: args,
  };
}
