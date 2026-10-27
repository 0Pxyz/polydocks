import { create } from "zustand";

export type ThemeId = "void" | "cyber" | "amber" | "amethyst";
export type WallpaperFit = "cover" | "contain" | "tile";

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
    description: "Night city blue with neon high-luminescence cyan",
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

export interface ThemeConfigState {
  theme: ThemeId;
  customAccentColor: string | null;
  wallpaperUrl: string | null;
  wallpaperFit: WallpaperFit;
  wallpaperOpacity: number; // 0.05 to 1.0
  wallpaperBlur: number; // 0 to 20 px

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
  clearWallpaper: () => void;
  resetTheme: () => void;
}

const STORAGE_KEY = "polymax-theme-config";

interface StoredThemeConfig {
  theme: ThemeId;
  customAccentColor: string | null;
  wallpaperUrl: string | null;
  wallpaperFit: WallpaperFit;
  wallpaperOpacity: number;
  wallpaperBlur: number;
}

const DEFAULT_CONFIG: StoredThemeConfig = {
  theme: "void",
  customAccentColor: null,
  wallpaperUrl: null,
  wallpaperFit: "cover",
  wallpaperOpacity: 0.25,
  wallpaperBlur: 0,
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
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StoredThemeConfig>;
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

function persistConfig(config: StoredThemeConfig) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    // Dispatch custom event for plugins or dynamic iframes
    window.dispatchEvent(
      new CustomEvent("polymax:theme-change", { detail: config })
    );
  } catch {
    // Storage quota or restriction
  }
}

export const useThemeStore = create<ThemeConfigState>((set, get) => {
  const initial = loadInitialConfig();

  // Expose on window.polymax for Agent plugins and dynamic tools
  if (typeof window !== "undefined") {
    const w = window as unknown as {
      polymax?: {
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
          resetTheme: () => void;
          getState: () => ThemeConfigState;
        };
        [key: string]: unknown;
      };
    };

    w.polymax = w.polymax || {};
    w.polymax.theme = {
      setTheme: (theme) => get().setTheme(theme),
      setCustomAccentColor: (c) => get().setCustomAccentColor(c),
      setWallpaper: (url, opts) => get().setWallpaper(url, opts),
      clearWallpaper: () => get().clearWallpaper(),
      resetTheme: () => get().resetTheme(),
      getState: () => get(),
    };
  }

  return {
    ...initial,

    setTheme: (theme: ThemeId) => {
      set((state) => {
        applyThemeDom(theme, state.customAccentColor);
        const next = { ...state, theme };
        persistConfig({
          theme: next.theme,
          customAccentColor: next.customAccentColor,
          wallpaperUrl: next.wallpaperUrl,
          wallpaperFit: next.wallpaperFit,
          wallpaperOpacity: next.wallpaperOpacity,
          wallpaperBlur: next.wallpaperBlur,
        });
        return { theme };
      });
    },

    setCustomAccentColor: (customAccentColor: string | null) => {
      set((state) => {
        applyThemeDom(state.theme, customAccentColor);
        const next = { ...state, customAccentColor };
        persistConfig({
          theme: next.theme,
          customAccentColor: next.customAccentColor,
          wallpaperUrl: next.wallpaperUrl,
          wallpaperFit: next.wallpaperFit,
          wallpaperOpacity: next.wallpaperOpacity,
          wallpaperBlur: next.wallpaperBlur,
        });
        return { customAccentColor };
      });
    },

    setWallpaper: (url, options) => {
      set((state) => {
        const next = {
          ...state,
          wallpaperUrl: url,
          wallpaperFit: options?.fit ?? state.wallpaperFit,
          wallpaperOpacity: options?.opacity ?? state.wallpaperOpacity,
          wallpaperBlur: options?.blur ?? state.wallpaperBlur,
        };
        persistConfig({
          theme: next.theme,
          customAccentColor: next.customAccentColor,
          wallpaperUrl: next.wallpaperUrl,
          wallpaperFit: next.wallpaperFit,
          wallpaperOpacity: next.wallpaperOpacity,
          wallpaperBlur: next.wallpaperBlur,
        });
        return {
          wallpaperUrl: next.wallpaperUrl,
          wallpaperFit: next.wallpaperFit,
          wallpaperOpacity: next.wallpaperOpacity,
          wallpaperBlur: next.wallpaperBlur,
        };
      });
    },

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

    clearWallpaper: () => {
      set((state) => {
        const next = { ...state, wallpaperUrl: null };
        persistConfig(next);
        return { wallpaperUrl: null };
      });
    },

    resetTheme: () => {
      applyThemeDom("void", null);
      persistConfig(DEFAULT_CONFIG);
      set({
        ...DEFAULT_CONFIG,
      });
    },
  };
});
