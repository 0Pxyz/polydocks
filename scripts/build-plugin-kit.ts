/**
 * Builds the vendored sandbox UI kit:
 * - server/plugin-kit/kit.bundle.js : React + react-dom/client + all 17 shadcn
 *   components as an IIFE assigning window.__polymaxKit (regenerate on dep bumps).
 * - server/plugin-kit/kit.css : Tailwind utilities for the kit components.
 * - server/plugin-kit/manifest.json : export inventory + sizes.
 *
 * Run: bun scripts/build-plugin-kit.ts
 */
import fs from "node:fs/promises";
import path from "node:path";
import { compile } from "tailwindcss";

const ROOT = path.resolve(import.meta.dir, "..");
const OUT_DIR = path.join(ROOT, "server", "plugin-kit");
const UI_DIR = path.join(ROOT, "src", "components", "ui");

const KIT_FILES = [
  "badge.tsx", "button.tsx", "command.tsx", "dialog.tsx", "dropdown-menu.tsx",
  "input.tsx", "popover.tsx", "progress.tsx", "scroll-area.tsx", "separator.tsx",
  "sheet.tsx", "skeleton.tsx", "slider.tsx", "sonner.tsx", "tabs.tsx",
  "textarea.tsx", "tooltip.tsx",
];

// Kit v2 primitives + patterns live in server/plugin-kit/kit/ and are
// aliased as @/components/ui/kit so guest code imports one stable path.
// They are read separately from the shadcn files above.
const KIT_V2_SOURCES = ["kit/primitives.tsx", "kit/patterns.tsx", "kit/level2.tsx"];

import { extractClassCandidates as extractCandidates } from "../server/workspace/reactKit";

async function buildJs(): Promise<{ bytes: number }> {
  const result = await Bun.build({
    entrypoints: [path.join(OUT_DIR, "entry.ts")],
    target: "browser",
    format: "iife",
    minify: true,
    sourcemap: "none",
    loader: { ".tsx": "tsx" },
    // Production React (react-dom development strings like "Internal React
    // error" must never ship inside plugin srcdocs).
    define: { "process.env.NODE_ENV": '"production"' },
  });
  if (!result.success) {
    const details = result.logs.map((l) => `${l.level}: ${l.message}`).join("\n");
    throw new Error(`Kit JS bundling failed:\n${details}`);
  }
  const text = await result.outputs[0].text();
  if (!text.includes("__polymaxKit")) {
    throw new Error("Kit bundle does not assign __polymaxKit");
  }
  await fs.writeFile(path.join(OUT_DIR, "kit.bundle.js"), text, "utf-8");
  return { bytes: Buffer.byteLength(text, "utf-8") };
}

async function loadStylesheet(id: string, base: string): Promise<{ content: string; base: string }> {
  const raw = id.startsWith(".") ? path.resolve(base, id) : path.join(ROOT, "node_modules", id);
  const tries = [raw, `${raw}.css`, path.join(raw, "index.css")];
  for (const p of tries) {
    try {
      const content = await fs.readFile(p, "utf-8");
      return { content, base: path.dirname(p) };
    } catch {
      // try next
    }
  }
  throw new Error(`Cannot resolve stylesheet "${id}"`);
}

/**
 * Shared Tailwind template: workspace tokens + default theme (spacing,
 * typography, animations) + app @theme mappings + utilities only.
 * The default theme import is load-bearing: without it, scale utilities
 * (h-9, p-4, gap-2, text-sm, animate-pulse, size-*) silently vanish from
 * the sandbox CSS and shadcn components render as raw HTML.
 */
const TAILWIND_TEMPLATE = (themeMatch: string, tokensCss: string): string =>
  `${tokensCss}\n@import "tailwindcss/theme";\n${themeMatch}\n@import "tailwindcss/utilities";`;

async function buildCss(uiSources: string[]): Promise<{ bytes: number }> {
  const indexCss = await fs.readFile(path.join(ROOT, "src", "index.css"), "utf-8");
  const themeMatch = indexCss.match(/@theme\s*\{[\s\S]*?\n\}/);
  if (!themeMatch) throw new Error("Could not find @theme block in src/index.css");
  // Ship tokens + theme so per-publish guest CSS compiles with the same tokens.
  const tokensCss = await fs.readFile(path.join(ROOT, "src", "styles", "tokens.css"), "utf-8");
  const compiler = await compile(TAILWIND_TEMPLATE(themeMatch[0], ""), {
    base: ROOT,
    loadStylesheet: loadStylesheet as any,
  });
  const css = compiler.build(extractCandidates(uiSources));
  await fs.writeFile(path.join(OUT_DIR, "kit.css"), css, "utf-8");
  await fs.writeFile(
    path.join(OUT_DIR, "theme.css"),
    TAILWIND_TEMPLATE(themeMatch[0], tokensCss),
    "utf-8"
  );
  return { bytes: Buffer.byteLength(css, "utf-8") };
}

const uiSources = await Promise.all(
  KIT_FILES.map((f) => fs.readFile(path.join(UI_DIR, f), "utf-8"))
);
const kitV2Sources = await Promise.all(
  KIT_V2_SOURCES.map((f) => fs.readFile(path.join(OUT_DIR, f), "utf-8"))
);
const allSources = [...uiSources, ...kitV2Sources];

// Inventory of flattened UI exports (duplicate check).
const exportNames: string[] = [];
for (const src of allSources) {
  for (const m of src.matchAll(/export\s+(?:function|const|class)\s+([A-Za-z_$][\w$]*)/g)) {
    exportNames.push(m[1]);
  }
  for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(",")) {
      const name = part.trim().split(/\s+as\s+/).pop()?.trim();
      if (name) exportNames.push(name);
    }
  }
}
const dupes = exportNames.filter((n, i) => exportNames.indexOf(n) !== i);
if (dupes.length > 0) throw new Error(`Duplicate kit export names: ${[...new Set(dupes)].join(", ")}`);

const js = await buildJs();
const css = await buildCss(allSources);

// Vendor the raw design tokens so the sandbox can define the shadcn
// semantic vars at runtime (prod images ship server/ but not src/).
await fs.copyFile(
  path.join(ROOT, "src", "styles", "tokens.css"),
  path.join(OUT_DIR, "tokens.css")
);

await fs.writeFile(
  path.join(OUT_DIR, "manifest.json"),
  JSON.stringify(
    { files: [...KIT_FILES, ...KIT_V2_SOURCES], version: "2.0.0", exports: exportNames, jsBytes: js.bytes, cssBytes: css.bytes, builtAt: new Date().toISOString() },
    null,
    2
  ),
  "utf-8"
);

console.log(`[plugin-kit] kit.bundle.js ${(js.bytes / 1024).toFixed(1)}KB, kit.css ${(css.bytes / 1024).toFixed(1)}KB, ${exportNames.length} exports`);
