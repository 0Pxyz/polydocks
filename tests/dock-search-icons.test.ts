import { describe, expect, test } from "bun:test";
import { resolveIcon, resolveUniqueIcon } from "../src/components/icons/adapter";
import { HOME_DOCK_TOOLS } from "../src/features/dock/AgenticDock";

describe("dock icon uniqueness", () => {
  test("settings no longer shares the sliders glyph", () => {
    expect(resolveIcon("settings")).not.toBe(resolveIcon("sliders"));
  });

  test("dock bar resolves to distinct icons per item", () => {
    for (const tools of [HOME_DOCK_TOOLS]) {
      const used = new Set();
      for (const tool of tools) {
        const key = typeof tool.icon === "string" ? tool.icon : tool.id;
        const resolved = resolveUniqueIcon(key, used);
        expect(used.has(resolved)).toBe(false);
        used.add(resolved);
      }
      expect(used.size).toBe(tools.length);
    }
  });

  test("later duplicates fall back to deterministic distinct glyphs", () => {
    const used = new Set([resolveIcon("files")]);
    const first = resolveUniqueIcon("folder", used);
    expect(first).not.toBe(resolveIcon("folder"));
    used.add(first);
    const second = resolveUniqueIcon("folder", used);
    expect(second).not.toBe(first);
  });

  test("the library tool keeps its own glyph", () => {
    const store = HOME_DOCK_TOOLS.find((t) => t.id === "store");
    expect(store?.icon).toBeDefined();
  });
});
