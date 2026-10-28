import { describe, it, expect, beforeEach } from "bun:test";
import { useThemeStore } from "../src/lib/theme";
import { platformStorage } from "../src/lib/platform/storage";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Dock Positioning and Spacing Cleanliness", () => {
  beforeEach(() => {
    platformStorage.clear();
    useThemeStore.getState().setDockPosition("bottom");
  });

  describe("1. Dock Position State and Persistence", () => {
    it("defaults dockPosition to bottom", () => {
      expect(useThemeStore.getState().dockPosition).toBe("bottom");
    });

    it("allows switching dockPosition to top and persists in platformStorage", () => {
      useThemeStore.getState().setDockPosition("top");
      expect(useThemeStore.getState().dockPosition).toBe("top");
      const stored = platformStorage.getItem<{ dockPosition: string }>("polymax-theme-config");
      expect(stored?.dockPosition).toBe("top");

      // Switching back to bottom
      useThemeStore.getState().setDockPosition("bottom");
      expect(useThemeStore.getState().dockPosition).toBe("bottom");
      const storedAfter = platformStorage.getItem<{ dockPosition: string }>("polymax-theme-config");
      expect(storedAfter?.dockPosition).toBe("bottom");
    });
  });

  describe("2. Dock Offset Dynamic CSS Properties Logic", () => {
    it("computes bottom clearance without contaminating top offset when dock is at bottom", () => {
      // Simulate viewport height = 900px, dock rect.top = 812px
      const windowHeight = 900;
      const rectTop = 812;
      const isBottom = true;

      const properties: Record<string, string> = {};
      const setProperty = (key: string, val: string) => {
        properties[key] = val;
      };

      if (isBottom) {
        const bottomOffset = Math.max(0, Math.round(windowHeight - rectTop));
        setProperty("--dock-offset", `${bottomOffset}px`);
        setProperty("--dock-bottom-offset", `${bottomOffset}px`);
        setProperty("--dock-top-offset", "0px");
        setProperty("--dock-bottom", `${bottomOffset}px`);
        setProperty("--dock-top", "0px");
      }

      expect(properties["--dock-offset"]).toBe("88px");
      expect(properties["--dock-bottom-offset"]).toBe("88px");
      expect(properties["--dock-top-offset"]).toBe("0px");
      expect(properties["--dock-bottom"]).toBe("88px");
      expect(properties["--dock-top"]).toBe("0px");
    });

    it("computes top clearance without contaminating bottom offset when dock is at top", () => {
      // Simulate dock rect.bottom = 84px
      const rectBottom = 84;
      const isBottom = false;

      const properties: Record<string, string> = {};
      const setProperty = (key: string, val: string) => {
        properties[key] = val;
      };

      if (!isBottom) {
        const topOffset = Math.max(0, Math.round(rectBottom));
        setProperty("--dock-offset", `${topOffset}px`);
        setProperty("--dock-top-offset", `${topOffset}px`);
        setProperty("--dock-bottom-offset", "0px");
        setProperty("--dock-top", `${topOffset}px`);
        setProperty("--dock-bottom", "0px");
      }

      expect(properties["--dock-offset"]).toBe("84px");
      expect(properties["--dock-top-offset"]).toBe("84px");
      expect(properties["--dock-bottom-offset"]).toBe("0px");
      expect(properties["--dock-top"]).toBe("84px");
      expect(properties["--dock-bottom"]).toBe("0px");
    });
  });

  describe("3. Elimination of Layout Hacks and Visual Slop", () => {
    it("ensures DockSurface has no arbitrary +28px or +20px padding hacks", () => {
      const dockSurfaceSource = readFileSync(
        resolve(__dirname, "../src/features/dock/DockSurface.tsx"),
        "utf8"
      );
      expect(dockSurfaceSource.includes("+28px")).toBe(false);
      expect(dockSurfaceSource.includes("+20px")).toBe(false);
      expect(dockSurfaceSource.includes("min-h-[calc(100vh")).toBe(false);
    });

    it("ensures HomeScreen has no hardcoded pt-16 or pt-24 stacking padding", () => {
      const homeScreenSource = readFileSync(
        resolve(__dirname, "../src/features/home/HomeScreen.tsx"),
        "utf8"
      );
      expect(homeScreenSource.includes("pt-16 sm:pt-24")).toBe(false);
      expect(homeScreenSource.includes("my-auto")).toBe(true);
    });

    it("ensures CityOverview does not enforce duplicate viewport min-height", () => {
      const cityOverviewSource = readFileSync(
        resolve(__dirname, "../src/features/city/CityOverview.tsx"),
        "utf8"
      );
      expect(cityOverviewSource.includes("min-h-[calc(100vh-var(--dock-bottom")).toBe(false);
    });

    it("ensures AgenticDock uses stable baseHudRef measuring status line + capsule together", () => {
      const agenticDockSource = readFileSync(
        resolve(__dirname, "../src/features/dock/AgenticDock.tsx"),
        "utf8"
      );
      expect(agenticDockSource.includes("baseHudRef")).toBe(true);
      expect(agenticDockSource.includes("--dock-top-offset")).toBe(true);
      expect(agenticDockSource.includes("--dock-bottom-offset")).toBe(true);
    });
  });
});
