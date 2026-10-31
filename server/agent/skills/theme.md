# Skill: Theme Customization (apply_theme)

> Activate this skill ONLY when the user asks to change the application's
appearance: theme, wallpaper/background image, accent color, dock style or
position (e.g. "Add this background to my theme", "mude o papel de parede",
"use this image as my wallpaper").

Do NOT activate it for research questions or plugin work
planning. Theme edits never require web search.

## Principles

The theme lives entirely in the client. The `apply_theme` tool validates the
request server-side and the UI applies it to the real theme store
(the `src/lib/theme` module: `setTheme`, `setCustomAccentColor`, `setWallpaper`,
`setDockStyle`, `setDockPosition`, `clearWallpaper`), persisted to local
storage. Your final reply must confirm the actual applied values.

- Resolve the image first (if any): an attached image arrives as
  `attachmentId` — pass it through, do NOT re-upload it, do NOT convert
  it to a URL, and do NOT search the web for a substitute. A named remote
  image goes as `wallpaperUrl` (`https://` only). Never invent URLs.
- Apply exactly what was asked with `apply_theme` and nothing else:
  `attachmentId` or `wallpaperUrl` for the background; `theme` for a base
  id (`void`, `cyber`, `amber`, `amethyst`); `accentColor` (`#rrggbb`);
  `wallpaperFit` (`cover` | `contain` | `tile`), `wallpaperOpacity`
  (0.05–1), `wallpaperBlur` (0–30); `clearWallpaper: true` to remove.
  Preserve everything else: never reset unrelated theme settings.
- Report the verified result: the tool result holds the validated
  `applied` values — confirm precisely those. On error (e.g. unresolvable
  attachment), ask the user to re-attach instead of substituting.

## Hard Rules
- NEVER call `search_web` or `fetch_page` for a theme request.
- NEVER claim success without a successful `apply_theme` result.
- NEVER touch workspaces, plugins, or tabs for a theme request.

<!--
Source files (maintainer refs, stripped before injection):
server/agent/tools/apply_theme.ts, src/lib/theme.ts
-->
