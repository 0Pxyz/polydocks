import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { useThemeStore, MAX_CUSTOM_WALLPAPERS } from "../src/lib/theme";
import { platformStorage } from "../src/lib/platform/storage";

const STORAGE_KEY = "polymax-theme-config";

/**
 * Custom wallpaper persistence (#309): uploads join a durable list shown
 * alongside presets, survive reload, can be removed, and quota failures
 * surface an explicit error instead of silently dropping the wallpaper.
 */
describe("custom wallpaper persistence (#309)", () => {
  beforeEach(() => {
    platformStorage.removeItem(STORAGE_KEY);
    useThemeStore.setState({
      wallpaperUrl: null,
      customWallpapers: [],
      wallpaperError: null,
    } as any);
  });
  afterEach(() => {
    platformStorage.removeItem(STORAGE_KEY);
    useThemeStore.setState({
      wallpaperUrl: null,
      customWallpapers: [],
      wallpaperError: null,
    } as any);
  });

  function stored(): any {
    return platformStorage.getItem(STORAGE_KEY);
  }

  it("registers uploads in the durable list and persists them", () => {
    const { setWallpaper } = useThemeStore.getState();
    setWallpaper("data:image/png;base64,AAA", { fit: "cover" });
    const state = useThemeStore.getState();
    expect(state.wallpaperUrl).toBe("data:image/png;base64,AAA");
    expect(state.customWallpapers).toEqual(["data:image/png;base64,AAA"]);
    expect(state.wallpaperError).toBeNull();
    // Reload contract: the stored JSON carries both.
    const raw = stored();
    expect(raw.wallpaperUrl).toBe("data:image/png;base64,AAA");
    expect(raw.customWallpapers).toEqual(["data:image/png;base64,AAA"]);
  });

  it("dedupes and caps the list most-recent-first", () => {
    const { setWallpaper } = useThemeStore.getState();
    for (let i = 0; i < MAX_CUSTOM_WALLPAPERS + 3; i++) {
      setWallpaper(`data:image/png;base64,W${i}`, { fit: "cover" });
    }
    setWallpaper("data:image/png;base64,W0", { fit: "cover" });
    const { customWallpapers } = useThemeStore.getState();
    expect(customWallpapers.length).toBe(MAX_CUSTOM_WALLPAPERS);
    expect(customWallpapers[0]).toBe("data:image/png;base64,W0");
  });

  it("keeps presets out of the custom list", () => {
    const { setWallpaper } = useThemeStore.getState();
    setWallpaper("https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=1600&q=80", { fit: "cover" });
    expect(useThemeStore.getState().customWallpapers).toEqual([]);
  });

  it("removes customs cleanly and clears the active one", () => {
    const { setWallpaper, removeWallpaper } = useThemeStore.getState();
    setWallpaper("data:image/gif;base64,G1", { fit: "cover" });
    setWallpaper("data:image/gif;base64,G2", { fit: "cover" });
    // Removing an inactive custom keeps the active wallpaper.
    removeWallpaper("data:image/gif;base64,G1");
    let state = useThemeStore.getState();
    expect(state.customWallpapers).toEqual(["data:image/gif;base64,G2"]);
    expect(state.wallpaperUrl).toBe("data:image/gif;base64,G2");
    // Removing the active one clears back to no wallpaper.
    removeWallpaper("data:image/gif;base64,G2");
    state = useThemeStore.getState();
    expect(state.customWallpapers).toEqual([]);
    expect(state.wallpaperUrl).toBeNull();
  });

  it("reverts with an explicit error when storage rejects the save", () => {
    const realSetItem = platformStorage.setItem;
    platformStorage.setItem = (() => false) as any;
    try {
      const { setWallpaper } = useThemeStore.getState();
      setWallpaper("data:image/png;base64,BIG", { fit: "cover" });
      const state = useThemeStore.getState();
      // Never pretend it stuck: previous (empty) wallpaper kept + error set.
      expect(state.wallpaperUrl).toBeNull();
      expect(state.wallpaperError).toMatch(/storage is full/i);
    } finally {
      platformStorage.setItem = realSetItem;
    }
    // Next success clears the error.
    useThemeStore.getState().setWallpaper(null);
    expect(useThemeStore.getState().wallpaperError).toBeNull();
  });
});
