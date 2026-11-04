import { create } from "zustand";
import type { DockStyleId, DockPosition } from "@/features/dock/styles";
import { platformStorage } from "@/lib/platform/storage";

export type ThemeId = "void" | "cyber" | "amber" | "amethyst";
export type WallpaperFit = "cover" | "contain" | "tile";
export type { DockStyleId, DockPosition };

export interface ThemeMeta {
  id: ThemeId;
  name: string;
  accentColor: string;
  bgColor: string;
  description: string;
}

export const THEMES: ThemeMeta[] = [
  {
    id: "void",
    name: "Void Lime",
    accentColor: "#C8FF57",
    bgColor: "#0A0A0C",
    description: "Deep obsidian void with electric lime optics",
  },
  {
    id: "cyber",
    name: "Cyber Cyan",
    accentColor: "#00E5FF",
    bgColor: "#060912",
    description: "Night blue with neon high-luminescence cyan",
  },
  {
    id: "amber",
    name: "Solar Amber",
    accentColor: "#F59E0B",
    bgColor: "#0D0A07",
    description: "Industrial warm amber glow with scorched charcoal surfaces",
  },
  {
    id: "amethyst",
    name: "Amethyst Violet",
    accentColor: "#B388FF",
    bgColor: "#0A0712",
    description: "Deep galactic purple with ethereal neon lavender",
  },
];

export const PRESET_WALLPAPERS: Array<{ name: string; url: string }> = [
  { name: "Cyber Grid", url: "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=1600&q=80" },
  { name: "Deep Space", url: "https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?auto=format&fit=crop&w=1600&q=80" },
  { name: "Abstract Neon", url: "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=1600&q=80" },
  { name: "Dark Matrix", url: "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1600&q=80" },
];

const PRESET_URLS = new Set(PRESET_WALLPAPERS.map((p) => p.url));

/** Max custom uploads kept (most-recent-first). */
export const MAX_CUSTOM_WALLPAPERS = 12;
/** Upload size cap: dataURLs inflate ~33%, localStorage is ~5MB. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export interface ThemeConfigState {
  theme: ThemeId;
  customAccentColor: string | null;
  wallpaperUrl: string | null;
  /** User uploads that survive reload alongside the presets (#309). */
  customWallpapers: string[];
  /** Last wallpaper failure, shown explicitly instead of failing silent. */
  wallpaperError: string | null;
  wallpaperFit: WallpaperFit;
  wallpaperOpacity: number; // 0.05 to 1.0
  wallpaperBlur: number; // 0 to 20 px
  dockStyle: DockStyleId;
  dockPosition: DockPosition;

  // Actions
  setTheme: (theme: ThemeId) => void;
  setCustomAccentColor: (color: string | null) => void;
  setWallpaper: (
    url: string | null,
    options?: {
      fit?: WallpaperFit;
      opacity?: number;
      blur?: number;
    }
  ) => void;
  setWallpaperFit: (fit: WallpaperFit) => void;
  setWallpaperOpacity: (opacity: number) => void;
  setWallpaperBlur: (blur: number) => void;
  setDockStyle: (style: DockStyleId) => void;
  setDockPosition: (pos: DockPosition) => void;
  clearWallpaper: () => void;
  reportWallpaperError: (message: string) => void;
  removeWallpaper: (url: string) => void;
  clearWallpaperError: () => void;
  resetTheme: () => void;
}

const STORAGE_KEY = "polydocks-theme-config";

interface StoredThemeConfig {
  theme: ThemeId;
  customAccentColor: string | null;
  wallpaperUrl: string | null;
  customWallpapers: string[];
  wallpaperFit: WallpaperFit;
  wallpaperOpacity: number;
  wallpaperBlur: number;
  dockStyle: DockStyleId;
  dockPosition: DockPosition;
}

const DEFAULT_CONFIG: StoredThemeConfig = {
  theme: "void",
  customAccentColor: null,
  wallpaperUrl: null,
  customWallpapers: [],
  wallpaperFit: "cover",
  wallpaperOpacity: 0.25,
  wallpaperBlur: 0,
  dockStyle: "glass",
  dockPosition: "top",
};

function applyThemeDom(
  theme: ThemeId,
  customAccent: string | null
) {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  root.setAttribute("data-theme", theme);

  if (customAccent) {
    root.style.setProperty("--accent-lime", customAccent);
    root.style.setProperty("--primary", customAccent);
    root.style.setProperty("--accent", customAccent);
    root.style.setProperty("--ring", customAccent);
  } else {
    root.style.removeProperty("--accent-lime");
    root.style.removeProperty("--primary");
    root.style.removeProperty("--accent");
    root.style.removeProperty("--ring");
  }
}

function loadInitialConfig(): StoredThemeConfig {
  if (typeof window === "undefined") return DEFAULT_CONFIG;

  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("wallpaper") === "bright") {
      const brightConfig: StoredThemeConfig = {
        theme: "cyber",
        customAccentColor: "#00FF66",
        customWallpapers: [],
        wallpaperUrl:
          "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=1600&q=80",
        wallpaperFit: "cover",
        wallpaperOpacity: 0.6,
        wallpaperBlur: 2,
        dockStyle: DEFAULT_CONFIG.dockStyle,
        dockPosition: DEFAULT_CONFIG.dockPosition,
      };
      applyThemeDom(brightConfig.theme, brightConfig.customAccentColor);
      return brightConfig;
    }
  } catch {
    // Ignore URL parse error
  }

  try {
    const parsed = platformStorage.getItem<Partial<StoredThemeConfig>>(STORAGE_KEY);
    if (parsed) {
      const config: StoredThemeConfig = {
        theme: THEMES.some((t) => t.id === parsed.theme)
          ? (parsed.theme as ThemeId)
          : DEFAULT_CONFIG.theme,
        customAccentColor:
          typeof parsed.customAccentColor === "string"
            ? parsed.customAccentColor
            : null,
        wallpaperUrl:
          typeof parsed.wallpaperUrl === "string"
            ? parsed.wallpaperUrl
            : null,
        customWallpapers: Array.isArray(parsed.customWallpapers)
          ? parsed.customWallpapers.filter((u): u is string => typeof u === "string").slice(0, MAX_CUSTOM_WALLPAPERS)
          : [],
        wallpaperFit:
          parsed.wallpaperFit === "cover" ||
          parsed.wallpaperFit === "contain" ||
          parsed.wallpaperFit === "tile"
            ? parsed.wallpaperFit
            : DEFAULT_CONFIG.wallpaperFit,
        wallpaperOpacity:
          typeof parsed.wallpaperOpacity === "number"
            ? Math.min(Math.max(parsed.wallpaperOpacity, 0.05), 1)
            : DEFAULT_CONFIG.wallpaperOpacity,
        wallpaperBlur:
          typeof parsed.wallpaperBlur === "number"
            ? Math.min(Math.max(parsed.wallpaperBlur, 0), 30)
            : DEFAULT_CONFIG.wallpaperBlur,
        dockStyle:
          parsed.dockStyle === "solid" ||
          parsed.dockStyle === "bare" ||
          parsed.dockStyle === "lift" ||
          parsed.dockStyle === "glass"
            ? parsed.dockStyle
            : DEFAULT_CONFIG.dockStyle,
        dockPosition:
          parsed.dockPosition === "bottom" || parsed.dockPosition === "top"
            ? parsed.dockPosition
            : DEFAULT_CONFIG.dockPosition,
      };

      applyThemeDom(config.theme, config.customAccentColor);
      return config;
    }
  } catch {
    // Storage access error or invalid JSON
  }

  applyThemeDom(DEFAULT_CONFIG.theme, DEFAULT_CONFIG.customAccentColor);
  return DEFAULT_CONFIG;
}

function persistConfig(config: StoredThemeConfig): boolean {
  // platformStorage.setItem reports quota/blocked storage via false, not
  // by throwing — check the boolean or the fallback below never runs.
  let ok = true;
  if (!platformStorage.setItem(STORAGE_KEY, config)) {
  // Quota (e.g. large DataURL/GIF): persist other preferences safely so
  // nothing breaks. Presets are tiny URLs and survive; customs are
  // dropped because they are what overflowed the quota.
  platformStorage.setItem(STORAGE_KEY, {
    ...config,
    wallpaperUrl: PRESET_URLS.has(config.wallpaperUrl ?? "") ? config.wallpaperUrl : null,
    customWallpapers: [],
  });
  ok = false;
  }

  if (typeof window !== "undefined") {
    try {
      // Dispatch custom event for plugins or dynamic iframes
      window.dispatchEvent(
        new CustomEvent("polydocks:theme-change", { detail: config })
      );
    } catch {
      // Ignore event dispatch errors
    }
  }
  return ok;
}

export const useThemeStore = create<ThemeConfigState>((set, get) => {
  const initial = loadInitialConfig();

  // Expose on window.polydocks for Agent plugins and dynamic tools
  if (typeof window !== "undefined") {
    const w = window as unknown as {
      polydocks?: {
        theme?: {
          setTheme: (theme: ThemeId) => void;
          setCustomAccentColor: (color: string | null) => void;
          setWallpaper: (
            url: string | null,
            options?: {
              fit?: WallpaperFit;
              opacity?: number;
              blur?: number;
            }
          ) => void;
          clearWallpaper: () => void;
          removeWallpaper: (url: string) => void;
          resetTheme: () => void;
          getState: () => ThemeConfigState;
        };
        [key: string]: unknown;
      };
    };

    w.polydocks = w.polydocks || {};
    w.polydocks.theme = {
      setTheme: (theme) => get().setTheme(theme),
      setCustomAccentColor: (c) => get().setCustomAccentColor(c),
      setWallpaper: (url, opts) => get().setWallpaper(url, opts),
      clearWallpaper: () => get().clearWallpaper(),
      removeWallpaper: (url) => get().removeWallpaper(url),
      resetTheme: () => get().resetTheme(),
      getState: () => get(),
    };
  }

  return {
    ...initial,
    customWallpapers: initial.customWallpapers,
    wallpaperError: null,

    setTheme: (theme: ThemeId) => {
      set((state) => {
        applyThemeDom(theme, state.customAccentColor);
        const next = { ...state, theme };
        persistConfig(next);
        return { theme };
      });
    },

    setCustomAccentColor: (customAccentColor: string | null) => {
      set((state) => {
        applyThemeDom(state.theme, customAccentColor);
        const next = { ...state, customAccentColor };
        persistConfig(next);
        return { customAccentColor };
      });
    },

    setWallpaper: (url, options) => {
      set((state) => {
        // Custom uploads join the durable list (most-recent-first, capped)
        // so the picker shows them alongside the presets after reload.
        const customs =
          typeof url === "string" && url.length > 0 && !PRESET_URLS.has(url)
            ? [url, ...state.customWallpapers.filter((u) => u !== url)].slice(0, MAX_CUSTOM_WALLPAPERS)
            : state.customWallpapers;
        const next = {
          ...state,
          customWallpapers: customs,
          wallpaperUrl: url,
          wallpaperFit: options?.fit ?? state.wallpaperFit,
          wallpaperOpacity: options?.opacity ?? state.wallpaperOpacity,
          wallpaperBlur: options?.blur ?? state.wallpaperBlur,
          wallpaperError: null,
        };
        if (!persistConfig(next)) {
          // Quota (or blocked storage): never pretend a wallpaper stuck.
          // Revert to the previous one and say so explicitly (#309).
          return {
            wallpaperError:
              "Couldn't save this wallpaper — storage is full. Try a smaller image (under ~4MB).",
          };
        }
        return {
          customWallpapers: next.customWallpapers,
          wallpaperUrl: next.wallpaperUrl,
          wallpaperFit: next.wallpaperFit,
          wallpaperOpacity: next.wallpaperOpacity,
          wallpaperBlur: next.wallpaperBlur,
          wallpaperError: null,
        };
      });
    },

    removeWallpaper: (url: string) => {
      set((state) => {
        const customWallpapers = state.customWallpapers.filter((u) => u !== url);
        const clearing = state.wallpaperUrl === url;
        const next = {
          ...state,
          customWallpapers,
          wallpaperUrl: clearing ? null : state.wallpaperUrl,
          wallpaperError: null,
        };
        persistConfig(next);
        return {
          customWallpapers,
          wallpaperUrl: next.wallpaperUrl,
          wallpaperError: null,
        };
      });
    },

    clearWallpaperError: () => set({ wallpaperError: null }),

    reportWallpaperError: (message: string) => set({ wallpaperError: message }),

    setWallpaperFit: (wallpaperFit) => {
      set((state) => {
        const next = { ...state, wallpaperFit };
        persistConfig(next);
        return { wallpaperFit };
      });
    },

    setWallpaperOpacity: (wallpaperOpacity) => {
      set((state) => {
        const next = { ...state, wallpaperOpacity };
        persistConfig(next);
        return { wallpaperOpacity };
      });
    },

    setWallpaperBlur: (wallpaperBlur) => {
      set((state) => {
        const next = { ...state, wallpaperBlur };
        persistConfig(next);
        return { wallpaperBlur };
      });
    },

    setDockStyle: (dockStyle) => {
      set((state) => {
        const next = { ...state, dockStyle };
        persistConfig(next);
        return { dockStyle };
      });
    },

    setDockPosition: (dockPosition) => {
      set((state) => {
        const next = { ...state, dockPosition };
        persistConfig(next);
        return { dockPosition };
      });
    },

    clearWallpaper: () => {
      set((state) => {
        const next = { ...state, wallpaperUrl: null, wallpaperError: null };
        persistConfig(next);
        return { wallpaperUrl: null, wallpaperError: null };
      });
    },

    resetTheme: () => {
      applyThemeDom("void", null);
      persistConfig(DEFAULT_CONFIG);
      set({
        ...DEFAULT_CONFIG,
        wallpaperError: null,
      });
    },
  };
});
