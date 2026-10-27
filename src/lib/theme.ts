import { create } from "zustand";

export type ThemeId = "void" | "cyber" | "amber" | "amethyst";

export interface ThemeMeta {
  id: ThemeId;
  name: string;
  accentColor: string;
  bgColor: string;
}

export const THEMES: ThemeMeta[] = [
  { id: "void", name: "Void Lime", accentColor: "#C8FF57", bgColor: "#0A0A0C" },
  { id: "cyber", name: "Cyber Cyan", accentColor: "#00E5FF", bgColor: "#060912" },
  { id: "amber", name: "Solar Amber", accentColor: "#F59E0B", bgColor: "#0D0A07" },
  { id: "amethyst", name: "Amethyst Violet", accentColor: "#B388FF", bgColor: "#0A0712" },
];

interface ThemeState {
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
}

const STORAGE_KEY = "polymax-theme";

function getInitialTheme(): ThemeId {
  if (typeof window === "undefined") return "void";
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as ThemeId | null;
    if (saved && THEMES.some((t) => t.id === saved)) {
      document.documentElement.setAttribute("data-theme", saved);
      return saved;
    }
  } catch {
    // Fallback on privacy-restricted storage
  }
  document.documentElement.setAttribute("data-theme", "void");
  return "void";
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: getInitialTheme(),
  setTheme: (theme: ThemeId) => {
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", theme);
    }
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Ignore storage write issues
    }
    set({ theme });
  },
}));
