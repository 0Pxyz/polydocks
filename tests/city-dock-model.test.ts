import { describe, expect, test } from "bun:test";
import {
  buildCityDockTools,
  orderVisibleIds,
  CITY_TOOL_IDS,
} from "../src/lib/dock/dockModel";

describe("buildCityDockTools", () => {
  test("swaps the city dock to the city tools", () => {
    const ids = buildCityDockTools().map((t) => t.id);
    expect(ids).toEqual([
      "agent",
      "maps",
      "sources",
      "notes",
      "files",
      "quests",
      "flashcards",
      "terminal",
      "settings",
    ]);
    for (const id of ["sources", "notes", "files", "quests", "flashcards", "terminal"]) {
      expect(ids).toContain(id);
    }
    // Browser opens in the city too (it renders the sources view), so the
    // last-tool memory covers it even though sources is the docked entry.
    expect(CITY_TOOL_IDS).toContain("browser");
  });

  test("moves counts that were on the cards to badges and tooltips", () => {
    const tools = buildCityDockTools({ sources: 4, notes: 2, quests: 3, doneQuests: 1 });
    const byId = new Map(tools.map((t) => [t.id, t]));
    expect(byId.get("sources")?.badge).toBe(4);
    expect(byId.get("notes")?.badge).toBe(2);
    expect(byId.get("quests")?.badge).toBe(3);
    expect(byId.get("quests")?.tooltipDetail).toBe("1 of 3 quests");
    expect(byId.get("flashcards")?.tooltipDetail).toBe("Ready");
    // No backing data, no invented badge.
    expect(byId.get("files")?.badge).toBeUndefined();
    expect(byId.get("terminal")?.badge).toBeUndefined();
  });

  test("without a summary every tool renders plainly", () => {
    const tools = buildCityDockTools();
    expect(tools.every((t) => t.badge === undefined)).toBe(true);
  });

  test("every city tool resolves to a distinct icon key", () => {
    const keys = buildCityDockTools().map((t) => t.icon);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("orderVisibleIds", () => {
  const all = ["agent", "maps", "sources", "notes", "files", "quests", "flashcards", "terminal", "settings"];

  test("pinned first, then contextual, then open", () => {
    expect(
      orderVisibleIds({
        all,
        pinned: ["agent", "maps"],
        contextual: ["sources", "notes", "files", "quests", "flashcards", "terminal"],
        open: ["terminal"],
        cap: 20,
      })
    ).toEqual(["agent", "maps", "sources", "notes", "files", "quests", "flashcards", "terminal"]);
  });

  test("unknown ids drop out and the cap still applies", () => {
    expect(
      orderVisibleIds({ all, pinned: ["agent", "nope"], contextual: ["sources"], open: [], cap: 2 })
    ).toEqual(["agent", "sources"]);
  });

  test("contextual items never need a global pin", () => {
    const ordered = orderVisibleIds({
      all,
      pinned: ["agent"],
      contextual: ["notes"],
      open: [],
      cap: 10,
    });
    expect(ordered).toContain("notes");
  });
});
