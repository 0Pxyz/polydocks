import fsSync from "node:fs";
import path from "node:path";
import { recordAudit } from "../services/audit";
import {
  upsertPluginFile,
  getPluginFile,
  listPluginFiles,
} from "./pluginFiles";
import { UI_KIT_FILES, codeHasImports } from "./reactKit";
// Single source of truth for the guest bridge: both srcdoc builders inline
// this script so the timeout + ready-handshake behavior ships identically.
import { GUEST_BRIDGE_SCRIPT } from "../../src/features/dock/bridge/guest-bridge.js";

export interface FeatureManifest {
  id: string;
  title: string;
  icon?: string;
  scope?: "city" | "global";
  capabilities?: string[];
  permissions?: unknown[];
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface FeatureData {
  manifest: FeatureManifest;
  code?: string;
  srcdoc: string;
  format: "feature-ts" | "legacy-html";
}

const MAX_FEATURE_SIZE_BYTES = 512 * 1024; // 512 KB safety cap

/**
 * Deterministically strips TypeScript types and transpiles feature code for browser execution.
 * Imports are validated against the vendored UI-kit allowlist (react,
 * react-dom/client, @/components/ui/*): allowlisted imports pass here and are
 * bundled at publish time; anything else is rejected with a clear error.
 */
export function transpileFeatureCode(tsCode: string): string {
  if (Buffer.byteLength(tsCode, "utf-8") > MAX_FEATURE_SIZE_BYTES) {
    throw new Error(
      `Security Violation: Feature code exceeds maximum allowed size of ${MAX_FEATURE_SIZE_BYTES} bytes`
    );
  }

  const loader = /^\s*import\s/m.test(tsCode) || /<[A-Za-z][\w]*(\s[^<>]*)?\/>|<\/[A-Za-z][\w]*/.test(tsCode) ? "tsx" : "ts";
  const transpiler = new Bun.Transpiler({
    loader,
    target: "browser",
  });

  // Validate guest imports against the allowlist; bundling happens in
  // writeFeature via the vendored kit (origin isolation is preserved).
  // scanImports also reports transpiler-injected JSX runtime require-calls;
  // those are kit-owned, not user-authored.
  const INJECTED_RUNTIME = new Set(["react", "react/jsx-runtime", "react/jsx-dev-runtime"]);
  const scannedImports = transpiler
    .scanImports(tsCode)
    .filter((imp) => !((imp as { kind?: string }).kind === "require-call" && INJECTED_RUNTIME.has(imp.path)));
  if (scannedImports.length > 0) {
    const allowedPattern = /^(@\/components\/ui\/[a-z-]+|react|react-dom\/client|react\/jsx-runtime|react\/jsx-dev-runtime)$/;
    const forbidden = scannedImports.filter((imp) => {
      if (!allowedPattern.test(imp.path)) return true;
      const uiMatch = imp.path.match(/^@\/components\/ui\/([a-z-]+)$/);
      if (uiMatch && !(UI_KIT_FILES as readonly string[]).includes(uiMatch[1])) return true;
      return false;
    });
    if (forbidden.length > 0) {
      const forbiddenPaths = forbidden.map((imp) => imp.path).join(", ");
      throw new Error(
        `Security Violation: Import "${forbiddenPaths}" is not allowed in plugin code. ` +
          `Allowed imports: react, react-dom/client, @/components/ui/{${UI_KIT_FILES.join(", ")}}. ` +
          `Use the shadcn kit and theme tokens instead of external packages, relative paths, or custom CSS.`
      );
    }
  }

  return transpiler.transformSync(tsCode);
}

/**
 * Native vanilla UI kit for the no-import (plain script) sandbox path.
 *
 * React plugins get the full shadcn kit; plain-script plugins get these
 * `px-*` classes instead, so both paths render native PolyDocks UI from the
 * same design tokens. Group with whitespace and surface steps, never outline
 * borders; state as plain text or a live badge, never decorative pills.
 */
const VANILLA_PX_CSS = `
    /* Legacy aliases: early vanilla plugins used these names. They track the
       semantic tokens above, so old code follows the active theme for free. */
    :root {
      --bg: var(--background);
      --surface: var(--card);
      --surface-hover: var(--secondary);
      --accent: var(--primary);
      --accent-dim: var(--accent);
      --border: var(--border);
      --text: var(--foreground);
      --muted: var(--muted-foreground);
      --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      --font-display: 'Syne', -apple-system, BlinkMacSystemFont, sans-serif;
      --font-mono: 'Geist Mono', monospace;
    }
    /* Typography: one sans scale, normal tracking, at most two levels. */
    .px-h1 { font-size: 15px; font-weight: 600; line-height: 1.3; letter-spacing: 0; color: var(--foreground); margin: 0; }
    .px-h2 { font-size: 13px; font-weight: 600; line-height: 1.4; letter-spacing: 0; color: var(--foreground); margin: 0; }
    .px-text { font-size: 13px; font-weight: 400; line-height: 1.6; color: var(--foreground); margin: 0; }
    .px-muted { font-size: 12px; font-weight: 400; line-height: 1.5; color: var(--muted-foreground); margin: 0; }
    .px-mono { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
    /* Buttons: primary for the main action, quiet for the rest. */
    .px-btn {
      display: inline-flex; align-items: center; justify-content: center; gap: 6px;
      background: var(--secondary); color: var(--secondary-foreground);
      border: 1px solid transparent; padding: 7px 14px; border-radius: 8px;
      cursor: pointer; font-size: 13px; font-weight: 500; font-family: inherit;
      transition: background 0.15s ease, transform 0.1s ease, opacity 0.15s ease;
    }
    .px-btn:hover { background: var(--muted); }
    .px-btn:active { transform: scale(0.97); }
    .px-btn-primary { background: var(--primary); color: var(--primary-foreground); font-weight: 600; }
    .px-btn-primary:hover { background: var(--primary); opacity: 0.9; }
    .px-btn:disabled { cursor: not-allowed; opacity: 0.55; }
    .px-btn:focus-visible, .px-icon-btn:focus-visible, .px-tab:focus-visible,
    .px-input:focus-visible, .px-select:focus-visible {
      outline: 2px solid var(--ring); outline-offset: 2px;
    }
    .px-icon-btn {
      display: inline-flex; align-items: center; justify-content: center;
      width: 32px; height: 32px; border-radius: 8px; cursor: pointer;
      background: transparent; color: var(--muted-foreground); border: 1px solid transparent;
      font-size: 15px; transition: background 0.15s ease, color 0.15s ease;
    }
    .px-icon-btn:hover { background: var(--secondary); color: var(--foreground); }
    /* Badge: live state only (Live, Paused). Never decoration. */
    .px-badge {
      display: inline-flex; align-items: center; gap: 6px;
      font-size: 13px; font-weight: 500; color: var(--foreground);
    }
    .px-badge .px-dot { width: 6px; height: 6px; border-radius: 9999px; background: var(--muted-foreground); }
    .px-badge.is-live .px-dot { background: var(--primary); animation: px-pulse 1.6s ease-in-out infinite; }
    @keyframes px-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
    /* Group: content breathes on a subtle surface step, no outline border. */
    .px-group { background: var(--card); border-radius: 12px; padding: 14px 16px; }
    /* Tabs / segmented control: one row, selected tab reads as the value. */
    .px-tabs { display: grid; background: var(--muted); border-radius: 10px; padding: 3px; gap: 2px; }
    .px-tab {
      border: 1px solid transparent; background: transparent; color: var(--muted-foreground);
      padding: 6px 10px; border-radius: 7px; cursor: pointer;
      font-size: 13px; font-weight: 500; font-family: inherit; text-align: center;
      transition: background 0.15s ease, color 0.15s ease;
    }
    .px-tab:hover { color: var(--foreground); }
    .px-tab[aria-selected="true"] { background: var(--background); color: var(--foreground); }
    /* Inputs: one quiet style, ring on focus, dim when disabled. */
    .px-input, .px-select, textarea.px-input {
      background: var(--background); border: 1px solid var(--input);
      color: var(--foreground); padding: 8px 12px; border-radius: 8px;
      font-size: 13px; font-family: inherit; outline: none; width: 100%;
    }
    .px-input:focus, .px-select:focus, textarea.px-input:focus { border-color: var(--ring); }
    .px-input:disabled, .px-select:disabled { opacity: 0.55; cursor: not-allowed; }
    .px-input::placeholder { color: var(--text-dim); }
    /* Skeleton: shimmer while loading. Empty state: centered truth, one action. */
    .px-skeleton {
      border-radius: 8px; background: var(--muted);
      background-image: linear-gradient(100deg, transparent 30%, var(--secondary) 50%, transparent 70%);
      background-size: 200% 100%; animation: px-shimmer 1.4s infinite;
    }
    @keyframes px-shimmer { from { background-position: 180% 0; } to { background-position: -80% 0; } }
    .px-empty { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 28px 16px; text-align: center; }
    /* Tooltip: contextual help via data-px-tip, no framework needed. */
    [data-px-tip] { position: relative; }
    [data-px-tip]:hover::after {
      content: attr(data-px-tip); position: absolute; bottom: calc(100% + 6px); left: 50%;
      transform: translateX(-50%); white-space: nowrap; pointer-events: none;
      background: var(--popover); color: var(--popover-foreground);
      font-size: 11px; padding: 4px 8px; border-radius: 6px; z-index: 50;
    }
    @media (prefers-reduced-motion: reduce) {
      .px-badge.is-live .px-dot, .px-skeleton { animation: none; }
      .px-btn:active { transform: none; }
    }
`;

// App design tokens (server/plugin-kit/tokens.css) inlined into the vanilla
// srcdoc so plain-script plugins use the exact same palette — including every
// [data-theme] override — as the React kit path. Cached; falls back to a
// minimal void palette if the kit file is missing (tests, fresh checkouts).
let vanillaTokensCache: string | null = null;

function getVanillaTokens(): string {
  if (vanillaTokensCache !== null) return vanillaTokensCache;
  try {
    const kitTokens = path.resolve(import.meta.dir, "..", "plugin-kit", "tokens.css");
    vanillaTokensCache = fsSync.readFileSync(kitTokens, "utf-8");
  } catch {
    vanillaTokensCache = `:root { --background: #0a0a0c; --foreground: #f1f3f9; --card: #12151d; --secondary: #1a1f2c; --muted: #1e2433; --muted-foreground: #8b95a8; --primary: #c8ff57; --primary-foreground: #0a0a0c; --accent: #c8ff57; --border: #222938; --input: #222938; --ring: #c8ff57; --popover: #12151d; --popover-foreground: #f1f3f9; --radius: 0.5rem; }`;
  }
  return vanillaTokensCache;
}

/** Exposed for tests: the vanilla kit must stay token-native (no raw hex). */
export function getVanillaKitCss(): string {
  return VANILLA_PX_CSS;
}

/**
 * Builds the sandboxed iframe srcdoc containing the app design tokens, the
 * native vanilla `px-*` component kit, the window.polymax bridge runtime,
 * and the transpiled guest code.
 */
export function buildFeatureSrcdoc(jsCode: string, manifest: FeatureManifest): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src https: data: blob:; media-src https: data: blob:; font-src data:; connect-src https:; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none';">
  <title>${escapeHtml(manifest.title)}</title>
  <style>
${getVanillaTokens()}
${VANILLA_PX_CSS}
  </style>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      background: var(--background);
      color: var(--foreground);
      font-family: var(--font-sans);
      min-height: 100vh;
      overflow-x: hidden;
      display: flex;
      flex-direction: column;
      padding: 20px;
    }
    #app {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      flex: 1;
    }
    /* Bare elements inherit the native look so legacy vanilla plugins
       improve automatically; new code should prefer the px-* classes. */
    button {
      display: inline-flex; align-items: center; justify-content: center; gap: 6px;
      background: var(--secondary); color: var(--secondary-foreground);
      border: 1px solid transparent; padding: 8px 14px; border-radius: 8px;
      cursor: pointer; font-size: 13px; font-weight: 500; font-family: inherit;
      transition: background 0.15s ease, opacity 0.15s ease;
    }
    button:hover { background: var(--muted); }
    button.primary { background: var(--primary); color: var(--primary-foreground); font-weight: 600; }
    button.primary:hover { background: var(--primary); opacity: 0.9; }
    button:disabled { cursor: not-allowed; opacity: 0.55; }
    button:focus-visible, input:focus-visible, textarea:focus-visible, select:focus-visible {
      outline: 2px solid var(--ring); outline-offset: 2px;
    }
    input, textarea, select {
      background: var(--background); border: 1px solid var(--input);
      color: var(--foreground); padding: 8px 12px; border-radius: 8px;
      font-size: 13px; font-family: inherit; outline: none;
    }
    input:focus, textarea:focus, select:focus { border-color: var(--ring); }
    input::placeholder, textarea::placeholder { color: var(--text-dim); }
  </style>
  <script>
    // Polymax Host-Guest Sandboxed Bridge Protocol (single source of truth:
    // src/features/dock/bridge/guest-bridge.js, inlined so the sandbox runs
    // it with no external fetch).
${GUEST_BRIDGE_SCRIPT}
  </script>
</head>
<body>
  <div id="app"></div>
  <script>
    try {
${escapeInlineScript(jsCode)}
      // Mounted without throwing: run the bridge ready handshake so the host
      // reveals the UI AND the guest learns the host is listening (the host
      // replies to polymaxAction: "ui.ready"; with no ack the guest reports
      // "bridge not responding" instead of hanging silently).
      if (window.polymax && window.polymax.__signalReady) {
        window.polymax.__signalReady();
      } else {
        window.parent.postMessage({ polymaxAction: "ui.ready" }, "*");
      }
    } catch (err) {
      console.error('[Polymax Guest Error]', err);
      window.parent.postMessage({
        polymaxAction: 'runtime.error',
        error: {
          message: err && err.message ? err.message : String(err),
          stack: err && err.stack ? err.stack : '',
          timestamp: new Date().toISOString()
        }
      }, '*');
      const app = document.getElementById('app');
      if (app) {
        app.innerHTML = '<div style="color: #FF5A5A; padding: 20px; font-size: 13px; font-family: monospace;"><b>Error executing feature:</b><br/>' + (err && err.message ? err.message : String(err)) + '</div>';
      }
    }
  </script>
</body>
</html>`;
}

/**
 * Builds the sandboxed iframe srcdoc for React (TSX) guest code: the vendored
 * kit bundle (React + react-dom/client + 17 shadcn components, no external
 * scripts, origin isolation preserved), compiled kit + guest Tailwind CSS,
 * the window.polymax bridge with useCapability/openContent, and the CSP the
 * agent prompt promises. Guest code stays TSX in one file and mounts into #app.
 */
export function buildReactSrcdoc(
  guestJs: string,
  guestCss: string,
  manifest: FeatureManifest,
  kit: { js: string; css: string; tokens: string; csp: string }
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="${kit.csp}">
  <title>${escapeHtml(manifest.title)}</title>
  <style>
${kit.tokens}
  </style>
  <style>
${kit.css}
  </style>
  <style>
${guestCss}
  </style>
  <script>
${escapeInlineScript(kit.js)}
  </script>
  <script>
    // Polymax Host-Guest Sandboxed Bridge Protocol (single source of truth:
    // src/features/dock/bridge/guest-bridge.js, inlined so the sandbox runs
    // it with no external fetch).
${GUEST_BRIDGE_SCRIPT}
  </script>
</head>
<body>
  <div id="app"></div>
  <script>
    try {
${escapeInlineScript(guestJs)}
      // Mounted without throwing: run the bridge ready handshake so the host
      // reveals the UI AND the guest learns the host is listening (the host
      // replies to polymaxAction: "ui.ready"; with no ack the guest reports
      // "bridge not responding" instead of hanging silently).
      if (window.polymax && window.polymax.__signalReady) {
        window.polymax.__signalReady();
      } else {
        window.parent.postMessage({ polymaxAction: "ui.ready" }, "*");
      }
    } catch (err) {
      console.error('[Polymax Guest Error]', err);
      window.parent.postMessage({
        polymaxAction: 'runtime.error',
        error: {
          message: err && err.message ? err.message : String(err),
          stack: err && err.stack ? err.stack : '',
          timestamp: new Date().toISOString()
        }
      }, '*');
      const app = document.getElementById('app');
      if (app) {
        app.innerHTML = '<div style="color: #FF5A5A; padding: 20px; font-size: 13px; font-family: monospace;"><b>Error executing feature:</b><br/>' + (err && err.message ? err.message : String(err)) + '</div>';
      }
    }
  </script>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Escapes JS for inlining inside an HTML <script> element.
 * The HTML parser ends the element at a literal `</script` (even inside a
 * JS string) and treats `<!--` as an escape hatch, so both must be
 * neutralized. Backslash-escaping is a no-op for JS string/regex/template
 * semantics (`<\/` === `/`), keeping the code byte-identical at runtime.
 * Single helper for every inline path: use it wherever JS goes into srcdoc.
 */
export function escapeInlineScript(js: string): string {
  return js
    .replace(/<\/script/gi, "<\\/script")
    .replace(/<!--/g, "<\\!--")
    .replace(/<script/gi, "<\\script");
}

/**
 * Writes and transpiles a TypeScript feature module into SQLite (single source
 * of truth). Filesystem mirroring to workspace/<city>/{features,tabs}/ was
 * removed: in production only ./data is a volume, so workspace/ files vanish
 * on redeploy while registry rows survive. DB rows survive with the volume.
 */
export async function writeFeature(
  workspaceId: string,
  featureId: string,
  options: {
    manifest: FeatureManifest;
    code: string;
  }
): Promise<{ manifest: FeatureManifest; compiledSrcdoc: string }> {
  if (!/^[a-z0-9_-]+$/.test(featureId)) {
    throw new Error(
      `Invalid feature identifier "${featureId}". Use lowercase alphanumeric, hyphens, or underscores.`
    );
  }

  const hasImports = codeHasImports(options.code);

  let srcdoc: string;
  if (hasImports) {
    // React path: allowlist rewrite + TSX bundling against the vendored kit
    // (origin isolation preserved, no allow-same-origin, no external scripts).
    const { bundleFeatureCode, compileGuestCss, getKitJs, getKitCss, getKitTokens, PLUGIN_CSP } =
      await import("./reactKit");
    const guestJs = bundleFeatureCode(options.code);
    const guestCss = await compileGuestCss(options.code);
    srcdoc = buildReactSrcdoc(guestJs, guestCss, options.manifest, {
      js: getKitJs(),
      css: getKitCss(),
      tokens: getKitTokens(),
      csp: PLUGIN_CSP,
    });
  } else {
    const transpiledJs = transpileFeatureCode(options.code);
    srcdoc = buildFeatureSrcdoc(transpiledJs, options.manifest);
  }

  const manifestData: FeatureManifest = {
    ...options.manifest,
    id: featureId,
    updatedAt: new Date().toISOString(),
  };

  // Single source of truth: SQLite plugin_files. No filesystem mirroring.
  upsertPluginFile({
    workspaceId: workspaceId,
    pluginId: featureId,
    version: (manifestData as { version?: string }).version || "1.0.0",
    manifest: manifestData,
    sourceCode: options.code,
    srcdoc,
  });

  recordAudit({ action: "create_feature", targetId: featureId, workspaceId, details: {
    featureId,
    title: manifestData.title,
    scope: manifestData.scope,
  } });

  return {
    manifest: manifestData,
    compiledSrcdoc: srcdoc,
  };
}

/**
 * Writes a legacy HTML blob tab into SQLite (single source of truth).
 * Used by create_tab/update_tab legacy paths.
 */
export async function writeLegacyFeature(
  workspaceId: string,
  featureId: string,
  manifest: FeatureManifest,
  html: string
): Promise<void> {
  const manifestData: FeatureManifest = {
    ...manifest,
    id: featureId,
    updatedAt: new Date().toISOString(),
  };
  upsertPluginFile({
    workspaceId: workspaceId,
    pluginId: featureId,
    version: (manifestData as { version?: string }).version || "1.0.0",
    manifest: manifestData,
    srcdoc: html,
  });
  recordAudit({ action: "create_feature", targetId: featureId, workspaceId, details: {
    featureId,
    title: manifestData.title,
    scope: manifestData.scope,
  } });
}

/**
 * Reads a feature from SQLite, the single source of truth.
 */
export async function readFeature(workspaceId: string, featureId: string): Promise<FeatureData> {
  const row = getPluginFile(featureId, workspaceId);
  if (row) {
    return {
      manifest: row.manifest,
      code: row.code,
      srcdoc: row.srcdoc,
      format: row.code ? "feature-ts" : "legacy-html",
    };
  }
  throw new Error(`Feature "${featureId}" not found in workspace "${workspaceId}".`);
}

/**
 * Lists all registered features from SQLite, the single source of truth.
 */
export async function listFeatures(
  workspaceId: string
): Promise<Array<FeatureManifest & { format: "feature-ts" | "legacy-html" }>> {
  const results: Array<FeatureManifest & { format: "feature-ts" | "legacy-html" }> = [];
  for (const entry of listPluginFiles(workspaceId)) {
    try {
      const feat = await readFeature(workspaceId, entry.pluginId);
      results.push({ ...feat.manifest, format: feat.format });
    } catch {
      // Skip invalid row
    }
  }
  return results;
}

/**
 * Deletes a feature from SQLite and the legacy filesystem mirror.
 * Also removes the workspace mount and, when nothing references the id
 * anymore (no mounts, no file rows anywhere), the auto-created registry row,
 * so create -> delete -> create lifecycles keep working. Version history in
 * plugin_versions is preserved for audit.
 */
export async function deleteFeature(workspaceId: string, featureId: string): Promise<void> {
  try {
    const { ensurePluginFilesTable } = await import("./pluginFiles");
    ensurePluginFilesTable();
    const { db } = await import("./db");
    db.query("DELETE FROM plugin_files WHERE workspace_id = ? AND plugin_id = ?").run(workspaceId, featureId);
    db.query("DELETE FROM workspace_plugins WHERE workspace_id = ? AND plugin_id = ?").run(workspaceId, featureId);
    const mountsLeft = (
      db.query("SELECT COUNT(*) as c FROM workspace_plugins WHERE plugin_id = ?").get(featureId) as any
    )?.c as number;
    const filesLeft = (
      db.query("SELECT COUNT(*) as c FROM plugin_files WHERE plugin_id = ?").get(featureId) as any
    )?.c as number;
    if (!mountsLeft && !filesLeft) {
      const reg = db.query("SELECT trust FROM plugins WHERE id = ?").get(featureId) as any;
      if (reg?.trust === "generated") {
        db.query("DELETE FROM plugins WHERE id = ?").run(featureId);
      }
    }
  } catch {
    // Non-fatal: record audit still runs.
  }

  recordAudit({ action: "delete_feature", targetId: featureId, workspaceId, details: { featureId } });
}
