import fs from "node:fs";
import path from "node:path";
import { compile } from "tailwindcss";

function kitDir(): string {
  // server/workspace/../plugin-kit regardless of how the file was loaded.
  return path.resolve(import.meta.dir, "..", "plugin-kit");
}

let kitJsCache: string | null = null;
let kitCssCache: string | null = null;
let kitExportsCache: string[] | null = null;

function readKitFile(name: string): string {
  return fs.readFileSync(path.join(kitDir(), name), "utf-8");
}

export function getKitJs(): string {
  if (!kitJsCache) kitJsCache = readKitFile("kit.bundle.js");
  return kitJsCache;
}

export function getKitCss(): string {
  if (!kitCssCache) kitCssCache = readKitFile("kit.css");
  return kitCssCache;
}

export function getKitExports(): string[] {
  if (!kitExportsCache) {
    const manifest = JSON.parse(readKitFile("manifest.json")) as { exports: string[] };
    kitExportsCache = manifest.exports;
  }
  return kitExportsCache;
}

let kitTokensCache: string | null = null;

export function getKitTokens(): string {
  if (!kitTokensCache) kitTokensCache = readKitFile("tokens.css");
  return kitTokensCache;
}

export const KIT_VERSION = "2.0.0";

/** Kit v2 composite import path (Level 1 parts + patterns, one stable path). */
export const KIT_V2_IMPORT = "kit";

export const UI_KIT_FILES = [
  "badge", "button", "command", "dialog", "dropdown-menu", "input", "popover",
  "progress", "scroll-area", "separator", "sheet", "skeleton", "slider",
  "sonner", "tabs", "textarea", "tooltip",
] as const;

const UI_IMPORT_RE = /^@\/components\/ui\/([a-z-]+)$/;

/**
 * True when code contains any import. Uses the TSX loader so JSX never breaks
 * detection; falls back to a regex on scanner failure.
 */
export function codeHasImports(code: string): boolean {
  try {
    const t = new Bun.Transpiler({ loader: "tsx", target: "browser" });
    return t.scanImports(code).length > 0;
  } catch {
    return /^\s*import\s/m.test(code);
  }
}

export function allowedImportsMessage(): string {
  return `Allowed imports: react, react-dom/client, @/components/ui/{${UI_KIT_FILES.join(", ")}} + @/components/ui/${KIT_V2_IMPORT} (kit v${KIT_VERSION}: layout, text, actions, inputs, data, feedback + patterns).`;
}

/**
 * Validates guest imports against the allowlist and rewrites them to the
 * vendored kit globals. Throws a clear Security Violation naming the allowed
 * set. Agent code stays TSX in a single file; the kit is bundled into the
 * sandbox runtime so the iframe keeps origin isolation (no allow-same-origin).
 */
export function rewriteKitImports(tsCode: string): string {
  const transpiler = new Bun.Transpiler({ loader: "tsx", target: "browser" });
  const scanned = transpiler.scanImports(tsCode);

  const reactNamed = new Set<string>();
  let needsReact = false;
  let needsCreateRoot = false;
  const uiNamed = new Set<string>();

  // Note: scanImports also reports the transpiler-injected automatic JSX
  // runtime as require-call entries (react, react/jsx-runtime,
  // react/jsx-dev-runtime). Those are provided by the vendored kit, not the
  // user, so only user-authored imports are validated here.
  const INJECTED_RUNTIME = new Set(["react", "react/jsx-runtime", "react/jsx-dev-runtime"]);

  for (const imp of scanned) {
    const spec = imp.path;
    if ((imp as { kind?: string }).kind === "require-call" && INJECTED_RUNTIME.has(spec)) continue;
    if (spec === "react") {
      needsReact = true;
    } else if (spec === "react-dom/client") {
      needsCreateRoot = true;
    } else if (spec === "react/jsx-runtime" || spec === "react/jsx-dev-runtime") {
      // Automatic JSX runtime injected by the transpiler: provided by the kit.
      needsReact = true;
    } else if (UI_IMPORT_RE.test(spec)) {
      needsReact = true;
      // Export-name validation happens during clause parsing below.
    } else {
      throw new Error(
        `Security Violation: Import "${spec}" is not allowed in plugin code. ${allowedImportsMessage()} ` +
          `Use the shadcn kit and theme tokens instead of external packages, relative paths, or custom CSS.`
      );
    }
  }

  // Strip type-only imports, then rewrite value imports to kit globals.
  // Note: scanImports does not report imported names, so clauses are parsed
  // with regex here (supports `a`, `a as b`, default + named mixes).
  let out = tsCode.replace(/import\s+type\s+[^;]+;/g, "");
  out = out.replace(/import\s*["'][^"']+["']\s*;?/g, (m) => {
    throw new Error(
      `Security Violation: Side-effect import is not allowed (${m.trim()}). ${allowedImportsMessage()}`
    );
  });

  const parseNamed = (clause: string): string[] => {
    const body = clause.match(/\{([\s\S]*)\}/)?.[1];
    if (!body) return [];
    return body
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        const alias = s.match(/^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/);
        return alias ? `${alias[1]}: ${alias[2]}` : s;
      });
  };

  // Capture default/namespace/named bindings for react before removing lines.
  const reactBindings = new Set<string>();
  out = out.replace(/import\s+([^;]*?)\s+from\s+["']react["']\s*;?/g, (_m, clause: string) => {
    const c = clause.trim();
    if (c.startsWith("*")) {
      const alias = c.match(/\*\s*as\s+([A-Za-z_$][\w$]*)/)?.[1];
      if (alias) reactBindings.add(alias);
    } else if (c.startsWith("{")) {
      for (const n of parseNamed(c)) reactNamed.add(n);
    } else {
      const parts = c.split(",").map((s) => s.trim());
      if (parts[0] && !parts[0].startsWith("{")) reactBindings.add(parts[0]);
      const namedPart = parts.slice(1).join(",");
      for (const n of parseNamed(namedPart)) reactNamed.add(n);
    }
    return "";
  });
  out = out.replace(/import\s+([^;]*?)\s+from\s+["']react-dom\/client["']\s*;?/g, (_m, clause: string) => {
    for (const n of parseNamed(clause)) {
      if (n.replace(/\s+/g, "") === "createRoot" || n.startsWith("createRoot:")) {
        needsCreateRoot = true;
      } else {
        throw new Error(
          `Security Violation: "react-dom/client" only exposes createRoot in plugin code. ${allowedImportsMessage()}`
        );
      }
    }
    if (!/createRoot/.test(clause)) needsCreateRoot = true;
    return "";
  });
  out = out.replace(/import\s+([^;]*?)\s+from\s+["']react\/jsx-dev-runtime["']\s*;?/g, "");
  out = out.replace(/import\s+([^;]*?)\s+from\s+["']react\/jsx-runtime["']\s*;?/g, "");
  out = out.replace(
    /import\s+([^;]*?)\s+from\s+["']@\/components\/ui\/([a-z-]+)["']\s*;?/g,
    (_m, clause: string, subpath: string) => {
      if (!(UI_KIT_FILES as readonly string[]).includes(subpath) && subpath !== KIT_V2_IMPORT) {
        throw new Error(
          `Security Violation: "@/components/ui/${subpath}" is not part of the UI kit. ${allowedImportsMessage()}`
        );
      }
      const names = parseNamed(clause);
      if (names.length === 0) {
        throw new Error(
          `Security Violation: UI kit imports must name components, e.g. import { Button } from "@/components/ui/button". ${allowedImportsMessage()}`
        );
      }
      for (const n of names) {
        const orig = n.split(":")[0].trim();
        if (!getKitExports().includes(orig)) {
          throw new Error(
            `Security Violation: "${orig}" is not exported by the UI kit. ${allowedImportsMessage()}`
          );
        }
        uiNamed.add(n);
      }
      return "";
    }
  );
  if (/^\s*export\s+/m.test(out)) {
    throw new Error(
      `Security Violation: export statements are not allowed. Plugin code is a single-file script: mount into #app with createRoot(...).render(...).`
    );
  }

  const preamble: string[] = [];
  if (needsReact || /<[A-Za-z]/.test(out)) {
    preamble.push(`const React = window.__polymaxKit.React;`);
    if (!/\bFragment\b/.test(tsCode.replace(/import\s+[^;]*?from\s+["']react["']\s*;?/g, ""))) {
      preamble.push(`const Fragment = window.__polymaxKit.React.Fragment;`);
    }
  }
  for (const b of reactBindings) {
    if (b !== "React") preamble.push(`const ${b} = window.__polymaxKit.React;`);
  }
  if (reactNamed.size > 0) {
    preamble.push(`const { ${[...reactNamed].join(", ")} } = window.__polymaxKit.React;`);
  }
  if (needsCreateRoot) {
    preamble.push(`const { createRoot } = window.__polymaxKit.ReactDOMClient;`);
  }
  if (uiNamed.size > 0) {
    preamble.push(`const { ${[...uiNamed].join(", ")} } = window.__polymaxKit.UI;`);
  }

  return `${preamble.join("\n")}\n${out}`;
}

const guestCssCache = new Map<string, string>();

/**
 * Compiles Tailwind utilities for guest class candidates with the vendored
 * theme (same tokens as kit.css). Cached by candidate hash.
 */
export async function compileGuestCss(tsCode: string): Promise<string> {
  const candidates = new Set<string>();
  for (const m of tsCode.matchAll(/["'`]([^"'`]{1,300})["'`]/g)) {
    for (const token of m[1].split(/\s+/)) {
      if (/^[A-Za-z0-9_.:/\[\]#][A-Za-z0-9_.:/\[\]#%()-]*$/.test(token) && token.length < 120) {
        candidates.add(token);
      }
    }
  }
  const key = [...candidates].sort().join("\n");
  const cached = guestCssCache.get(key);
  if (cached !== undefined) return cached;

  const themeTemplate = readKitFile("theme.css");
  const compiler = await compile(themeTemplate, {
    base: path.resolve(import.meta.dir, "..", ".."),
    loadStylesheet: (async (id: string, base: string) => {
      const raw = id.startsWith(".") ? path.resolve(base, id) : path.resolve(import.meta.dir, "..", "..", "node_modules", id);
      const tries = [raw, `${raw}.css`, path.join(raw, "index.css")];
      for (const p of tries) {
        try {
          return { content: fs.readFileSync(p, "utf-8"), base: path.dirname(p) };
        } catch {
          // try next
        }
      }
      throw new Error(`Cannot resolve stylesheet "${id}"`);
    }) as any,
  });
  const css = compiler.build([...candidates]);
  guestCssCache.set(key, css);
  if (guestCssCache.size > 200) guestCssCache.clear();
  return css;
}

/**
 * Full React bundling path for import-bearing guest code: allowlist rewrite,
 * TSX transpile, JSX-runtime normalization to the vendored kit.
 */
export function bundleFeatureCode(tsCode: string): string {
  const rewritten = rewriteKitImports(tsCode);
  // Production JSX runtime: with NODE_ENV=production the transpiler emits
  // jsx_/jsxs_ helpers (never jsxDEV_), matching the production kit bundle.
  const transpiler = new Bun.Transpiler({
    loader: "tsx",
    target: "browser",
    define: { "process.env.NODE_ENV": '"production"' },
  });
  let js = transpiler.transformSync(rewritten);
  // Normalize the automatic JSX runtime helpers to the vendored kit. Bun's
  // transpiler emits version-hashed identifiers (jsxDEV_<hash> in dev,
  // jsx_<hash>/jsxs_<hash> in production); all resolve to the same kit fns.
  js = js
    .replace(/\bjsxDEV_[A-Za-z0-9]+/g, "window.__polymaxKit.jsxDEV")
    .replace(/\bjsxs_[A-Za-z0-9]+/g, "window.__polymaxKit.jsxs")
    .replace(/\bjsx_[A-Za-z0-9]+/g, "window.__polymaxKit.jsx");
  if (/\bjsxDEV_[A-Za-z0-9]+|\bjsxs_[A-Za-z0-9]+|\bjsx_[A-Za-z0-9]+/.test(js)) {
    throw new Error("Security Violation: Unresolved JSX runtime after kit normalization.");
  }
  // Reject any user-authored imports the rewrite missed (dynamic import(),
  // require() calls). Transpiler-injected JSX runtime entries are kit-owned.
  const INJECTED = new Set(["react", "react/jsx-runtime", "react/jsx-dev-runtime"]);
  const remaining = transpiler
    .scanImports(rewritten)
    .filter((imp) => !((imp as { kind?: string }).kind === "require-call" && INJECTED.has(imp.path)));
  if (remaining.length > 0) {
    throw new Error(
      `Security Violation: Import "${remaining[0].path}" is not allowed in plugin code. ${allowedImportsMessage()}`
    );
  }
  return js;
}

/**
 * CSP for the sandboxed srcdoc. Matches what the agent prompt promises:
 * no external scripts/styles (CDN blocked), inline only; images/media and
 * https fetch still allowed. The sandbox attribute keeps origin isolation.
 */
export const PLUGIN_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; " +
  "img-src https: data: blob:; media-src https: data: blob:; font-src data:; " +
  "connect-src https: wss:; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none';";
