# Skill: Theme Customization (apply_theme)

> **Skill Identifier:** `theme`
> **Source Target:** `server/agent/skills/theme.md`

---

## 1. When to Use This Skill

Activate this skill ONLY when the user asks to change the application's
appearance: theme, wallpaper/background image, accent color, dock style or
position (e.g. "Add this background to my theme", "mude o papel de parede",
"use this image as my wallpaper").

Do NOT activate it for research questions, plugin/tab work, or city/world
planning. Theme edits never require web search.

## 2. Theme Editing Protocol

The theme lives entirely in the client. The `apply_theme` tool validates the
request server-side and the UI applies it to the real theme store
(`src/lib/theme.ts`: `setTheme`, `setCustomAccentColor`, `setWallpaper`,
`setDockStyle`, `setDockPosition`, `clearWallpaper`), persisted to local
storage. Your final reply must confirm the actual applied values.

### Step 1: Resolve the image (if any)
- If the user attached an image, its file reference arrives as
  `attachmentId`. Pass it through as `attachmentId` — do NOT re-upload it,
  do NOT convert it to a URL yourself, and do NOT search the web for a
  substitute image.
- If the user named a remote image, pass its `https://` URL as
  `wallpaperUrl`. Never invent URLs.

### Step 2: Apply exactly what was asked (`apply_theme`)
Call `apply_theme` with ONLY the fields the user requested:
- `attachmentId` or `wallpaperUrl` for the background image.
- `theme` for a base theme id (`void`, `cyber`, `amber`, `amethyst`).
- `accentColor` for a custom `#rrggbb` accent.
- `wallpaperFit` (`cover` | `contain` | `tile`), `wallpaperOpacity`
  (0.05–1), `wallpaperBlur` (0–30) to tune the background.
- `clearWallpaper: true` to remove the background.
- Preserve everything else: never reset unrelated theme settings.

### Step 3: Report the verified result
The tool result contains the validated `applied` values. Confirm precisely
those values in your reply. If the tool reports an error (e.g. the
attachment could not be resolved), ask the user to re-attach the image
instead of substituting another one.

## 3. Hard Rules
- NEVER call `search_web` or `fetch_page` for a theme request.
- NEVER claim success without a successful `apply_theme` result.
- NEVER touch workspaces, cities, plugins, or tabs for a theme request.
