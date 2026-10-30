import { describe, it, expect } from "bun:test";
import { buildFeatureSrcdoc, getVanillaKitCss } from "./features";

/**
 * The vanilla (no-import) plugin path must render native PolyDocks UI from
 * the same tokens as the React kit path: full theme palettes, px-*
 * primitives, interaction states, and zero hardcoded colors.
 */
describe("vanilla px kit (plain-script plugin runtime)", () => {
  it("exposes every requested primitive as a px-* class", () => {
    const css = getVanillaKitCss();
    for (const cls of [
      ".px-btn",
      ".px-icon-btn",
      ".px-h1",
      ".px-text",
      ".px-muted",
      ".px-mono",
      ".px-badge",
      ".px-group",
      ".px-tabs",
      ".px-tab",
      ".px-input",
      ".px-select",
      ".px-skeleton",
      ".px-empty",
      "[data-px-tip]",
    ]) {
      expect(css).toContain(cls);
    }
  });

  it("is token-native: no hardcoded hex colors", () => {
    const css = getVanillaKitCss();
    const hexes = [...css.matchAll(/#([0-9a-fA-F]{3,8})\b/g)].map((m) => m[0]);
    expect(hexes).toEqual([]);
  });

  it("covers interaction states and reduced motion", () => {
    const css = getVanillaKitCss();
    expect(css).toContain(":hover");
    expect(css).toContain(":disabled");
    expect(css).toContain(":focus-visible");
    expect(css).toContain("prefers-reduced-motion");
  });

  it("srcdoc inlines the app theme palettes, not a forked palette", () => {
    const srcdoc = buildFeatureSrcdoc("console.log(1);", {
      id: "kit-probe",
      title: "Kit Probe",
    });
    for (const theme of ['[data-theme="void"]', '[data-theme="cyber"]', '[data-theme="amber"]']) {
      expect(srcdoc).toContain(theme);
    }
    expect(srcdoc).toContain("--bg: var(--background)");
    expect(srcdoc).toContain("px-btn");
  });

  it("bare elements inherit the native look (legacy vanilla plugins improve)", () => {
    const srcdoc = buildFeatureSrcdoc("console.log(1);", {
      id: "kit-probe",
      title: "Kit Probe",
    });
    // No browser-default controls: element selectors carry the kit style.
    expect(srcdoc).toContain("button.primary");
    expect(srcdoc).toContain("input:focus");
  });
});
