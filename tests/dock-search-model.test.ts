import { describe, expect, test } from "bun:test";
import {
  applyDockDirective,
  buildDockSections,
  computeVisibleCap,
  createItemsForQuery,
  getStaticCreateRows,
  migratePinnedIds,
  scoreDockItem,
  sliceEmptyQueryRows,
  DEFAULT_PINNED_IDS,
  SYSTEM_TOOL_IDS,
  type DockItem,
  type DockLayoutState,
} from "../src/lib/dock/dockModel";

const catalog: DockItem[] = [
  { id: "maps", label: "World Map", description: "Travel the knowledge map", icon: "maps", kind: "builtin", system: true },
  { id: "agent", label: "Agent", description: "Talk to the dock agent", icon: "agent", kind: "builtin" },
  { id: "browser", label: "Research & Sources", description: "Research and sources", icon: "browser", kind: "builtin" },
  { id: "notes", label: "Notes", description: "Synthesized notes", icon: "notes", kind: "builtin" },
  { id: "gtm-feed", label: "GTM Feed", description: "Go-to-market news plugin", icon: "rss", kind: "plugin" },
  { id: "flashcards", label: "Flashcards", description: "Interactive flashcards", icon: "cards", kind: "tab" },
];

const store: DockItem[] = [
  { id: "pomodoro", label: "Pomodoro Timer", description: "Focus timer plugin", icon: "clock", kind: "store" },
];

const layout: DockLayoutState = { pinnedIds: ["agent", "maps"], openIds: ["gtm-feed"] };

describe("scoreDockItem", () => {
  test("ranks label prefix above substring above description", () => {
    const item: DockItem = {
      id: "x",
      label: "GTM Feed",
      description: "go-to-market news",
      icon: "rss",
      kind: "plugin",
    };
    expect(scoreDockItem(item, "gtm")).toBeGreaterThan(scoreDockItem(item, "feed"));
    expect(scoreDockItem(item, "feed")).toBeGreaterThan(scoreDockItem(item, "news"));
    expect(scoreDockItem(item, "zzz")).toBe(-1);
  });

  test("empty query keeps everything", () => {
    expect(scoreDockItem(catalog[0], "")).toBe(0);
    expect(scoreDockItem(catalog[0], "   ")).toBe(0);
  });
});

describe("buildDockSections", () => {
  test("orders sections docked, yours, store, create", () => {
    const sections = buildDockSections({
      catalog,
      store,
      layout,
      query: "",
      createForQuery: () => [],
    });
    expect(sections.map((s) => s.id)).toEqual(["docked", "yours", "store", "create"]);
    expect(sections[0].title).toBe("In your dock");
    expect(sections[1].title).toBe("Your tools");
    expect(sections[2].title).toBe("Store");
    expect(sections[3].title).toBe("Create with agent");
  });

  test("docked holds pinned and open items, yours holds the rest", () => {
    const sections = buildDockSections({
      catalog,
      store,
      layout,
      query: "",
      createForQuery: () => [],
    });
    const dockedIds = sections[0].items.map((i) => i.id).sort();
    expect(dockedIds).toEqual(["agent", "gtm-feed", "maps"]);
    const yoursIds = sections[1].items.map((i) => i.id).sort();
    expect(yoursIds).toEqual(["browser", "flashcards", "notes"]);
    // System item never appears in the removable list.
    expect(yoursIds).not.toContain("maps");
  });

  test("query filters and ranks across sections", () => {
    const sections = buildDockSections({
      catalog,
      store,
      layout,
      query: "gtm",
      createForQuery: () => [],
    });
    expect(sections[0].items.map((i) => i.id)).toEqual(["gtm-feed"]);
    expect(sections[1].items).toEqual([]);
    expect(sections[2].items).toEqual([]);
  });

  test("uninstalled store items never leak into yours", () => {
    const sections = buildDockSections({
      catalog,
      store,
      layout,
      query: "",
      createForQuery: () => [],
    });
    const yoursIds = sections[1].items.map((i) => i.id);
    expect(yoursIds).not.toContain("pomodoro");
    expect(sections[2].items.map((i) => i.id)).toEqual(["pomodoro"]);
  });
});

describe("createItemsForQuery", () => {
  test("generates rows from the query, never static", () => {
    const items = createItemsForQuery("Stoicism");
    expect(items.length).toBe(3);
    expect(items.every((i) => i.kind === "create")).toBe(true);
    expect(items[0].label).toContain("Stoicism");
    expect(createItemsForQuery("   ")).toEqual([]);
  });

  test("two keystrokes find an unpinned plugin", () => {
    const sections = buildDockSections({
      catalog,
      store,
      layout: { pinnedIds: [], openIds: [] },
      query: "gt",
      createForQuery: () => [],
    });
    const yoursIds = sections[1].items.map((i) => i.id);
    expect(yoursIds).toContain("gtm-feed");
  });
});

describe("getStaticCreateRows", () => {
  test("mirrors the original suggestions, city-aware when a city exists", () => {
    const city = getStaticCreateRows("Stoicism");
    expect(city.map((i) => i.label)).toEqual([
      "Flashcards for Stoicism",
      "Compare two sources on Stoicism",
      "A timeline of Stoicism",
    ]);
    const generic = getStaticCreateRows();
    expect(generic.map((i) => i.label)).toEqual(["Flashcards", "A reading list", "A timeline"]);
    const emptyCity = getStaticCreateRows("   ");
    expect(emptyCity.map((i) => i.label)).toEqual(["Flashcards", "A reading list", "A timeline"]);
  });
});

describe("sliceEmptyQueryRows", () => {
  const row = (id: string): DockItem => ({
    id,
    label: id,
    description: "",
    icon: "cards",
    kind: "tab",
  });

  test("caps the empty panel at six rows: open, yours, then create", () => {
    const open = [row("a"), row("b"), row("c")];
    const yours = [row("d"), row("e"), row("f"), row("g"), row("h")];
    const sliced = sliceEmptyQueryRows({ open, yours });
    expect(sliced.open.map((r) => r.id)).toEqual(["a", "b"]);
    // 2 open + 3 create = 5, so 1 yours row fits.
    expect(sliced.yours.map((r) => r.id)).toEqual(["d"]);
  });

  test("fills yours up when nothing is open", () => {
    const yours = [row("d"), row("e"), row("f"), row("g")];
    const sliced = sliceEmptyQueryRows({ open: [], yours });
    expect(sliced.yours.map((r) => r.id)).toEqual(["d", "e", "f"]);
  });
});

describe("computeVisibleCap", () => {
  test("derives the cap from measured width, not a magic count", () => {
    expect(computeVisibleCap(600)).toBe(Math.floor((600 - 72) / 46));
    expect(computeVisibleCap(200)).toBeGreaterThanOrEqual(1);
    expect(computeVisibleCap(0)).toBe(1);
  });

  test("thirty installed items stay capped by a narrow bar", () => {
    const cap = computeVisibleCap(500);
    expect(30).toBeGreaterThan(cap);
    expect(cap).toBeLessThan(12);
  });
});

describe("applyDockDirective", () => {
  const known = new Set(["maps", "agent", "browser", "gtm-feed", "flashcards"]);

  test("pin and unpin round-trip without deleting", () => {
    const empty: DockLayoutState = { pinnedIds: [], openIds: [] };
    const pinned = applyDockDirective(empty, { op: "pin", id: "gtm-feed" }, known);
    expect(pinned.ok).toBe(true);
    expect(pinned.layout.pinnedIds).toEqual(["gtm-feed"]);

    const unpinned = applyDockDirective(pinned.layout, { op: "unpin", id: "gtm-feed" }, known);
    expect(unpinned.ok).toBe(true);
    expect(unpinned.layout.pinnedIds).toEqual([]);
    expect(unpinned.message).toMatch(/stays installed/i);
  });

  test("open and close round-trip without deleting", () => {
    const empty: DockLayoutState = { pinnedIds: [], openIds: [] };
    const opened = applyDockDirective(empty, { op: "open", id: "flashcards" }, known);
    expect(opened.ok).toBe(true);
    expect(opened.layout.openIds).toEqual(["flashcards"]);

    const closed = applyDockDirective(opened.layout, { op: "close", id: "flashcards" }, known);
    expect(closed.ok).toBe(true);
    expect(closed.layout.openIds).toEqual([]);
    expect(closed.message).toMatch(/nothing was deleted/i);
  });

  test("unknown ids fail visibly", () => {
    for (const op of ["open", "close", "pin", "unpin"] as const) {
      const result = applyDockDirective(
        { pinnedIds: [], openIds: [] },
        { op, id: "nope" },
        known
      );
      expect(result.ok).toBe(false);
      expect(result.message).toMatch(/no dock item/i);
    }
  });

  test("the map cannot be unpinned or closed", () => {
    const layoutWithMap: DockLayoutState = { pinnedIds: ["maps"], openIds: ["maps"] };
    expect(applyDockDirective(layoutWithMap, { op: "unpin", id: "maps" }, known).ok).toBe(false);
    expect(applyDockDirective(layoutWithMap, { op: "close", id: "maps" }, known).ok).toBe(false);
    // ...but pinning and opening it are harmless no-ops that succeed.
    expect(applyDockDirective(layoutWithMap, { op: "pin", id: "maps" }, known).ok).toBe(true);
  });

  test("repeat directives are idempotent successes", () => {
    const state: DockLayoutState = { pinnedIds: ["agent"], openIds: [] };
    expect(applyDockDirective(state, { op: "pin", id: "agent" }, known).ok).toBe(true);
    expect(applyDockDirective(state, { op: "close", id: "agent" }, known).ok).toBe(true);
    expect(applyDockDirective(state, { op: "unpin", id: "browser" }, known).ok).toBe(true);
  });

  test("defaults keep the curated core without the store", () => {
    expect(DEFAULT_PINNED_IDS).toEqual(["agent", "maps", "settings"]);
    expect(DEFAULT_PINNED_IDS).not.toContain("store");
    expect(SYSTEM_TOOL_IDS.has("maps")).toBe(true);
  });

  test("the Plugin Store migrates out of persisted pins without deleting", () => {
    expect(migratePinnedIds(["agent", "maps", "store", "settings"])).toEqual([
      "agent",
      "maps",
      "settings",
    ]);
    expect(migratePinnedIds(["agent", "maps"])).toEqual(["agent", "maps"]);
    expect(migratePinnedIds(["store"])).toEqual(["agent", "maps", "settings"]);
  });
});
