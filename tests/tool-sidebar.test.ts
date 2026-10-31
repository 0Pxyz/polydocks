import { describe, it, expect, beforeEach } from "bun:test";
import {
  DOCK_ACTIONS,
  matchDockShortcut,
  panelLayout,
  isBesideEligible,
  BESIDE_WIDTH_DEFAULT,
  BESIDE_WIDTH_MAX,
  BESIDE_WIDTH_MIN,
} from "../src/lib/dock/dockItems";
import { useDockStore, loadBeside } from "../src/lib/store/useDockStore";
import { platformStorage } from "../src/lib/platform/storage";

const BESIDE_KEY = "polymax-tool-sidebar";

function resetBesideStorage() {
  platformStorage.removeItem(BESIDE_KEY);
  useDockStore.getState().resetDock();
}

describe("beside registry", () => {
  it("registers sidebar.beside with a unique shortcut", () => {
    const entry = DOCK_ACTIONS.find((action) => action.id === "sidebar.beside");
    expect(entry).toBeDefined();
    expect(entry?.hint).toBe("Ctrl+Shift+S");
    const codes = DOCK_ACTIONS.filter((action) => action.id !== "tabs.focus").map(
      (action) => action.shortcut.code
    );
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("matches Ctrl+Shift+S and the Alt+S fallback", () => {
    expect(
      matchDockShortcut({ code: "KeyS", ctrlKey: true, shiftKey: true })?.action.id
    ).toBe("sidebar.beside");
    expect(matchDockShortcut({ code: "KeyS", altKey: true })?.action.id).toBe(
      "sidebar.beside"
    );
    expect(matchDockShortcut({ code: "KeyS", shiftKey: false })).toBeNull();
  });

  it("admits tools and plugins, never the agent, map, or browser", () => {
    const dynamic = new Set(["my-plugin", "gtm-feed"]);
    for (const id of ["settings", "theme", "plugins", "creations", "store", "my-plugin", "gtm-feed"]) {
      expect(isBesideEligible(id, dynamic)).toBe(true);
    }
    for (const id of ["", "agent", "maps", "browser", undefined]) {
      expect(isBesideEligible(id, dynamic)).toBe(false);
    }
  });
});

describe("beside open state", () => {
  beforeEach(() => {
    resetBesideStorage();
  });

  it("opens beside and persists ids plus width across reloads", () => {
    const store = useDockStore.getState();
    expect(store.besideIds).toEqual([]);
    expect(store.besideWidth).toBe(BESIDE_WIDTH_DEFAULT);
    store.openBeside("notes");
    expect(useDockStore.getState().besideIds).toEqual(["notes"]);
    expect(platformStorage.getItem<{ ids?: string[]; width?: number }>(BESIDE_KEY)).toEqual({
      ids: ["notes"],
      width: BESIDE_WIDTH_DEFAULT,
    });
    // Reload equivalent: the store loader resolves the persisted set.
    expect(loadBeside()).toEqual({ ids: ["notes"], width: BESIDE_WIDTH_DEFAULT });
    useDockStore.getState().clearBeside();
    expect(loadBeside().ids).toEqual([]);
  });

  it("opening the focused tool beside frees the main view without stealing focus", () => {
    const store = useDockStore.getState();
    store.openTool("browser");
    store.focusTool("browser");
    expect(useDockStore.getState().dock.focusedId).toBe("browser");
    useDockStore.getState().openBeside("browser");
    const after = useDockStore.getState();
    expect(after.besideIds).toContain("browser");
    expect(after.dock.focusedId).not.toBe("browser");
    // No duplicate entries on repeat opens.
    after.openBeside("browser");
    expect(useDockStore.getState().besideIds.filter((id) => id === "browser")).toHaveLength(1);
  });

  it("closing a tool drops it from beside (single home per tool)", () => {
    const store = useDockStore.getState();
    store.openBeside("notes");
    expect(useDockStore.getState().besideIds).toContain("notes");
    useDockStore.getState().closeTool("notes");
    expect(useDockStore.getState().besideIds).not.toContain("notes");
  });

  it("closing beside keeps the record open and unfocused", () => {
    const store = useDockStore.getState();
    store.openBeside("notes");
    useDockStore.getState().closeBeside("notes");
    expect(useDockStore.getState().besideIds).toEqual([]);
    // Record untouched: refocusing from the dock restores it in main.
    expect(useDockStore.getState().dock.items["notes"]?.state).not.toBe("closed");
  });

  it("clamps and persists the beside width", () => {
    useDockStore.getState().setBesideWidth(10000);
    expect(useDockStore.getState().besideWidth).toBe(BESIDE_WIDTH_MAX);
    useDockStore.getState().setBesideWidth(-5);
    expect(useDockStore.getState().besideWidth).toBe(BESIDE_WIDTH_MIN);
    expect(loadBeside().width).toBe(BESIDE_WIDTH_MIN);
    useDockStore.getState().setBesideWidth(BESIDE_WIDTH_DEFAULT);
  });

  it("runDockAction toggles the focused tool beside", () => {
    const store = useDockStore.getState();
    store.openTool("browser");
    store.focusTool("browser");
    const opened = useDockStore.getState().runDockAction("sidebar.beside");
    expect(opened.ok).toBe(true);
    expect(useDockStore.getState().besideIds).toContain("browser");
    const closed = useDockStore.getState().runDockAction("sidebar.beside", { id: "browser" });
    expect(closed.ok).toBe(true);
    expect(useDockStore.getState().besideIds).not.toContain("browser");
    expect(closed.message).not.toBe(opened.message);
  });

  it("runDockAction refuses the agent panel (it has its own surface)", () => {
    const res = useDockStore.getState().runDockAction("sidebar.beside", { id: "agent" });
    expect(res.ok).toBe(false);
  });

  it("runDockAction with no focus and no id refuses cleanly", () => {
    useDockStore.getState().resetDock();
    const res = useDockStore.getState().runDockAction("sidebar.beside");
    expect(res.ok).toBe(false);
  });

  it("resetDock clears the beside set to the fresh default", () => {
    useDockStore.getState().openBeside("notes");
    useDockStore.getState().setBesideWidth(BESIDE_WIDTH_MAX);
    useDockStore.getState().resetDock();
    const state = useDockStore.getState();
    expect(state.besideIds).toEqual([]);
    expect(state.besideWidth).toBe(BESIDE_WIDTH_DEFAULT);
  });
});

describe("three-region placement rule", () => {
  const WIDE = 1280;
  const NARROW = 800;
  const SIDE = 400;
  const BESIDE = 380;

  it("chat alone docks left and reserves its width", () => {
    expect(
      panelLayout({ chatSideOpen: true, besideCount: 0, viewportWidth: WIDE, sideWidth: SIDE, besideWidth: BESIDE })
    ).toEqual({
      chatSide: true,
      besideSide: false,
      besideOverlay: false,
      mainMarginLeft: SIDE,
      mainMarginRight: 0,
    });
  });

  it("both panels dock (chat left, beside right) and sum their margins", () => {
    const layout = panelLayout({ chatSideOpen: true, besideCount: 2, viewportWidth: WIDE, sideWidth: SIDE, besideWidth: BESIDE });
    expect(layout.chatSide).toBe(true);
    expect(layout.besideSide).toBe(true);
    expect(layout.besideOverlay).toBe(false);
    expect(layout.mainMarginLeft).toBe(SIDE);
    expect(layout.mainMarginRight).toBe(BESIDE);
  });

  it("beside alone docks right", () => {
    const layout = panelLayout({ chatSideOpen: false, besideCount: 1, viewportWidth: WIDE, sideWidth: SIDE, besideWidth: BESIDE });
    expect(layout.mainMarginLeft).toBe(0);
    expect(layout.mainMarginRight).toBe(BESIDE);
  });

  it("narrow viewports overlay the beside panel instead of docking", () => {
    const layout = panelLayout({ chatSideOpen: false, besideCount: 1, viewportWidth: NARROW, sideWidth: SIDE, besideWidth: BESIDE });
    expect(layout.besideSide).toBe(false);
    expect(layout.besideOverlay).toBe(true);
    expect(layout.mainMarginLeft).toBe(0);
    expect(layout.mainMarginRight).toBe(0);
  });

  it("nothing open reserves nothing", () => {
    const layout = panelLayout({ chatSideOpen: false, besideCount: 0, viewportWidth: WIDE, sideWidth: SIDE, besideWidth: BESIDE });
    expect(layout.mainMarginLeft).toBe(0);
    expect(layout.mainMarginRight).toBe(0);
    expect(layout.besideOverlay).toBe(false);
  });
});
