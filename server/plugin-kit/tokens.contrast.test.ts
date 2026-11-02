import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";

/**
 * Deterministic a11y QA for the workspace themes (no browser needed):
 * every theme in src/styles/tokens.css must keep WCAG AA text contrast
 * (≥ 4.5) for body/muted/button text pairs after resolving var() chains.
 * A theme switch must never silently drop legibility for generated plugins.
 */

function readTokens(): string {
  return fs.readFileSync(path.resolve(import.meta.dir, "../../src/styles/tokens.css"), "utf-8");
}

function parseThemes(css: string): Record<string, Record<string, string>> {
  const themes: Record<string, Record<string, string>> = {};
  // Split on theme selectors, capture vars per block.
  const re = /\[data-theme="([\w-]+)"\]\s*\{([^}]*)\}|:root,\s*\[data-theme="void"\]\s*\{([^}]*)\}/g;
  for (const m of css.matchAll(re)) {
    const name = m[1] || "void";
    const body = m[2] || m[3] || "";
    const vars: Record<string, string> = {};
    for (const vm of body.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
      vars[vm[1]] = vm[2].trim();
    }
    themes[name] = Object.assign({}, themes[name], vars);
  }
  return themes;
}

function resolveVar(vars: Record<string, string>, value: string, depth = 0): string {
  if (depth > 6) return value;
  const m = value.match(/^var\(--([\w-]+)\)$/);
  if (!m) return value;
  const next = vars[m[1]];
  if (!next) return value;
  return resolveVar(vars, next, depth + 1);
}

function luminance(hex: string): number {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const rgb = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

function ratio(a: string, b: string): number {
  const l1 = luminance(a);
  const l2 = luminance(b);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

const PAIRS: Array<[string, string, string]> = [
  ["foreground", "background", "body text"],
  ["muted-foreground", "background", "muted text"],
  ["card-foreground", "card", "card text"],
  ["primary-foreground", "primary", "primary button text"],
  ["accent-foreground", "accent", "accent text"],
];

describe("theme token contrast (WCAG AA, per theme)", () => {
  it("all themes keep body/muted/button text at >= 4.5", () => {
    const themes = parseThemes(readTokens());
    expect(Object.keys(themes).length).toBeGreaterThan(0);
    const failures: string[] = [];
    const report: string[] = [];
    for (const [theme, vars] of Object.entries(themes)) {
      for (const [fg, bg, label] of PAIRS) {
        const f = resolveVar(vars, vars[fg] || "");
        const b = resolveVar(vars, vars[bg] || "");
        if (!/^#[0-9a-fA-F]{3,8}$/.test(f) || !/^#[0-9a-fA-F]{3,8}$/.test(b)) {
          failures.push(`${theme}: ${label} unresolvable (${fg}=${f}, ${bg}=${b})`);
          continue;
        }
        const r = ratio(f, b);
        report.push(`${theme} ${label}: ${r.toFixed(2)}`);
        if (r < 4.5) failures.push(`${theme}: ${label} ratio ${r.toFixed(2)} < 4.5 (${f} on ${b})`);
      }
    }
    expect(failures, report.join("; ")).toEqual([]);
  });
});
