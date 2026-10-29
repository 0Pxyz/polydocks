import fs from "node:fs/promises";
import path from "node:path";
import {
  resolveSafeCityPath,
  readCityFile,
  deleteCityFile,
  appendAuditLog,
} from "./cityWorkspace";
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
 * Builds the sandboxed iframe srcdoc containing design tokens,
 * the window.polymax bridge runtime, and the transpiled guest code.
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
    :root {
      --bg: #0A0A0C;
      --surface: #131318;
      --surface-hover: #1C1C24;
      --accent: #C8FF57;
      --accent-dim: rgba(200, 255, 87, 0.15);
      --border: #23232E;
      --text: #F0F0F5;
      --muted: #A0A0B0;
      --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      --font-display: 'Syne', -apple-system, BlinkMacSystemFont, sans-serif;
      --font-mono: 'Geist Mono', monospace;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      background: var(--bg);
      color: var(--text);
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
    button {
      background: var(--surface);
      color: var(--text);
      border: 1px solid var(--border);
      padding: 8px 14px;
      border-radius: 8px;
      cursor: pointer;
      font-size: 13px;
      transition: background 0.15s ease, border-color 0.15s ease;
    }
    button:hover {
      background: var(--surface-hover);
      border-color: var(--accent);
    }
    button.primary {
      background: var(--accent);
      color: #0A0A0C;
      font-weight: 600;
      border-color: var(--accent);
    }
    button.primary:hover {
      background: #D4FF70;
    }
    input, textarea {
      background: var(--surface);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 8px 12px;
      border-radius: 8px;
      font-size: 13px;
      outline: none;
    }
    input:focus, textarea:focus {
      border-color: var(--accent);
    }
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
  cityId: string,
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
    workspaceId: cityId,
    pluginId: featureId,
    version: (manifestData as { version?: string }).version || "1.0.0",
    manifest: manifestData,
    sourceCode: options.code,
    srcdoc,
  });

  await appendAuditLog(cityId, "create_feature", {
    featureId,
    title: manifestData.title,
    scope: manifestData.scope,
  });

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
  cityId: string,
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
    workspaceId: cityId,
    pluginId: featureId,
    version: (manifestData as { version?: string }).version || "1.0.0",
    manifest: manifestData,
    srcdoc: html,
  });
  await appendAuditLog(cityId, "create_feature", {
    featureId,
    title: manifestData.title,
    scope: manifestData.scope,
  });
}

/**
 * Reads a feature from SQLite first, falling back to the filesystem only
 * during the migration window (workspaces not yet imported into the DB).
 */
export async function readFeature(cityId: string, featureId: string): Promise<FeatureData> {
  // 1. SQLite single source of truth (exact workspace, then any workspace).
  try {
    const row = getPluginFile(featureId, cityId);
    if (row) {
      return {
        manifest: row.manifest,
        code: row.code,
        srcdoc: row.srcdoc,
        format: row.code ? "feature-ts" : "legacy-html",
      };
    }
  } catch {
    // Fall through to filesystem migration fallback.
  }

  // 2. Filesystem fallback during migration only.
  try {
    const manifestRaw = await readCityFile(cityId, `features/${featureId}/manifest.json`);
    const manifest = JSON.parse(manifestRaw) as FeatureManifest;

    let code: string | undefined;
    try {
      code = await readCityFile(cityId, `features/${featureId}/feature.ts`);
    } catch {
      // Code file optional if only srcdoc exists
    }

    let srcdoc: string;
    try {
      srcdoc = await readCityFile(cityId, `features/${featureId}/index.html`);
    } catch {
      if (code) {
        if (codeHasImports(code)) {
          const { bundleFeatureCode, compileGuestCss, getKitJs, getKitCss, getKitTokens, PLUGIN_CSP } =
            await import("./reactKit");
          srcdoc = buildReactSrcdoc(bundleFeatureCode(code), await compileGuestCss(code), manifest, {
            js: getKitJs(),
            css: getKitCss(),
            tokens: getKitTokens(),
            csp: PLUGIN_CSP,
          });
        } else {
          const js = transpileFeatureCode(code);
          srcdoc = buildFeatureSrcdoc(js, manifest);
        }
      } else {
        throw new Error(`Feature "${featureId}" is missing compiled srcdoc.`);
      }
    }

    return {
      manifest,
      code,
      srcdoc,
      format: "feature-ts",
    };
  } catch {
    // 2. Fall back to legacy tab blob
    const manifestRaw = await readCityFile(cityId, `tabs/${featureId}/manifest.json`);
    const manifest = JSON.parse(manifestRaw) as FeatureManifest;
    const srcdoc = await readCityFile(cityId, `tabs/${featureId}/index.html`);

    return {
      manifest,
      srcdoc,
      format: "legacy-html",
    };
  }
}

/**
 * Lists all registered features and tabs: SQLite first, filesystem fallback
 * merged in during the migration window.
 */
export async function listFeatures(
  cityId: string
): Promise<Array<FeatureManifest & { format: "feature-ts" | "legacy-html" }>> {
  const resultsMap = new Map<string, FeatureManifest & { format: "feature-ts" | "legacy-html" }>();

  // SQLite single source of truth first.
  try {
    for (const entry of listPluginFiles(cityId)) {
      try {
        const feat = await readFeature(cityId, entry.pluginId);
        resultsMap.set(entry.pluginId, { ...feat.manifest, format: feat.format });
      } catch {
        // Skip invalid row
      }
    }
  } catch {
    // Table may not exist yet in very old flows; fall through to FS.
  }

  const cityRoot = await resolveSafeCityPath(cityId, ".");

  // Scan modern features/ directory
  try {
    const featuresDir = path.join(cityRoot, "features");
    const entries = await fs.readdir(featuresDir);
    for (const id of entries) {
      if (id.startsWith(".")) continue;
      try {
        const feat = await readFeature(cityId, id);
        resultsMap.set(id, { ...feat.manifest, format: feat.format });
      } catch {
        // Skip invalid directory
      }
    }
  } catch {
    // features/ directory may not exist yet
  }

  // Scan legacy tabs/ directory for any not in features/
  try {
    const tabsDir = path.join(cityRoot, "tabs");
    const entries = await fs.readdir(tabsDir);
    for (const id of entries) {
      if (id.startsWith(".") || resultsMap.has(id)) continue;
      try {
        const feat = await readFeature(cityId, id);
        resultsMap.set(id, { ...feat.manifest, format: feat.format });
      } catch {
        // Skip invalid directory
      }
    }
  } catch {
    // tabs/ directory may not exist yet
  }

  return Array.from(resultsMap.values());
}

/**
 * Deletes a feature from SQLite and the legacy filesystem mirror.
 * Also removes the workspace mount and, when nothing references the id
 * anymore (no mounts, no file rows anywhere), the auto-created registry row,
 * so create -> delete -> create lifecycles keep working. Version history in
 * plugin_versions is preserved for audit.
 */
export async function deleteFeature(cityId: string, featureId: string): Promise<void> {
  try {
    const { ensurePluginFilesTable } = await import("./pluginFiles");
    ensurePluginFilesTable();
    const { db } = await import("./db");
    db.query("DELETE FROM plugin_files WHERE workspace_id = ? AND plugin_id = ?").run(cityId, featureId);
    db.query("DELETE FROM workspace_plugins WHERE workspace_id = ? AND plugin_id = ?").run(cityId, featureId);
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
    // Non-fatal: filesystem cleanup below still runs.
  }

  const errors: any[] = [];

  try {
    await deleteCityFile(cityId, `features/${featureId}/feature.ts`);
  } catch (e) {
    errors.push(e);
  }
  try {
    await deleteCityFile(cityId, `features/${featureId}/manifest.json`);
  } catch (e) {
    errors.push(e);
  }
  try {
    await deleteCityFile(cityId, `features/${featureId}/index.html`);
  } catch (e) {
    errors.push(e);
  }

  try {
    await deleteCityFile(cityId, `tabs/${featureId}/manifest.json`);
  } catch (e) {
    errors.push(e);
  }
  try {
    await deleteCityFile(cityId, `tabs/${featureId}/index.html`);
  } catch (e) {
    errors.push(e);
  }

  // Clean up directory if empty
  const cityRoot = await resolveSafeCityPath(cityId, ".");
  await fs.rm(path.join(cityRoot, "features", featureId), { recursive: true, force: true }).catch(() => {});
  await fs.rm(path.join(cityRoot, "tabs", featureId), { recursive: true, force: true }).catch(() => {});

  await appendAuditLog(cityId, "delete_feature", { featureId });
}
