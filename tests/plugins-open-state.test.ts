import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { canOpenPluginView, MAIN_VIEW_STATIC_IDS } from "../src/lib/dock/dockModel";

const viewPath = resolve(__dirname, "../src/features/plugins/PluginsView.tsx");

/**
 * Tools open contract (#380): capability-only plugins (search, sources,
 * files, sandbox — real caps, zero surfaces, no ToolSurface route) used
 * to offer the same click-to-open affordance as everything else, then
 * resolve to no viewport at all. Rows for those must open Details; one
 * shared rule decides, so App routing and the row contract cannot drift.
 */
describe("plugins open state (#380)", () => {
  test("generated plugins with surfaces open", () => {
    expect(
      canOpenPluginView({ id: "box-breathing", enabled: true, surfaces: [{ id: "box-breathing" }] })
    ).toBe(true);
  });

  test("routed static tools open even without manifest surfaces", () => {
    expect(canOpenPluginView({ id: "notes", enabled: true, surfaces: [] })).toBe(true);
    expect(canOpenPluginView({ id: "browser", enabled: true, surfaces: [] })).toBe(true);
    expect(canOpenPluginView({ id: "onboarding", enabled: true, surfaces: [] })).toBe(true);
    for (const id of MAIN_VIEW_STATIC_IDS) {
      expect(canOpenPluginView({ id, enabled: true, surfaces: [] })).toBe(true);
    }
  });

  test("capability-only plugins have no view (live registry shape)", () => {
    for (const id of ["search", "sources", "files", "sandbox", "kit-gallery"]) {
      expect(canOpenPluginView({ id, enabled: true, surfaces: [] })).toBe(false);
    }
    // Generated but surfaceless: nothing to mount either.
    expect(canOpenPluginView({ id: "gtm-reader", enabled: true, surfaces: [] })).toBe(false);
  });

  test("disabled plugins never open (row click enables instead)", () => {
    expect(canOpenPluginView({ id: "notes", enabled: false, surfaces: [] })).toBe(false);
    expect(
      canOpenPluginView({ id: "box-breathing", enabled: false, surfaces: [{ id: "box-breathing" }] })
    ).toBe(false);
  });

  test("row click falls back to Details for viewless plugins", () => {
    const view = readFileSync(viewPath, "utf-8");
    expect(view).toContain("canOpenPluginView(plugin)");
    expect(view).toContain("else onSelect(plugin)");
    expect(view).toContain("No preview surface — opens details");
  });

  test("detail sheet offers an explicit Open action for openable plugins", () => {
    const view = readFileSync(viewPath, "utf-8");
    expect(view).toContain("canOpenPluginView(selectedPlugin)");
    expect(view).toContain("onOpenPlugin(selectedPlugin.id)");
  });
});
