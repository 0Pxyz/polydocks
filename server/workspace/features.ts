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
 * Enforces strict security boundaries: guest code is forbidden from importing external modules.
 */
export function transpileFeatureCode(tsCode: string): string {
  if (Buffer.byteLength(tsCode, "utf-8") > MAX_FEATURE_SIZE_BYTES) {
    throw new Error(
      `Security Violation: Feature code exceeds maximum allowed size of ${MAX_FEATURE_SIZE_BYTES} bytes`
    );
  }

  const transpiler = new Bun.Transpiler({
    loader: "ts",
    target: "browser",
  });

  // Verify that the guest module does not attempt to import anything
  const scannedImports = transpiler.scanImports(tsCode);
  if (scannedImports.length > 0) {
    const forbiddenPaths = scannedImports.map((imp) => imp.path).join(", ");
    throw new Error(
      `Security Violation: Feature modules must be self-contained. Forbidden imports detected: [${forbiddenPaths}]`
    );
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
    // Polymax Host-Guest Sandboxed Bridge Protocol
    (function() {
      const pendingRequests = new Map();
      let requestId = 0;

      window.addEventListener('message', function(event) {
        if (!event.data || typeof event.data !== 'object') return;
        const { polymaxResponseId, result, error } = event.data;
        if (polymaxResponseId && pendingRequests.has(polymaxResponseId)) {
          const { resolve, reject } = pendingRequests.get(polymaxResponseId);
          pendingRequests.delete(polymaxResponseId);
          if (error) reject(new Error(error));
          else resolve(result);
        }
      });

      function sendHostRequest(action, payload) {
        return new Promise((resolve, reject) => {
          const id = ++requestId;
          pendingRequests.set(id, { resolve, reject });
          window.parent.postMessage({
            polymaxAction: action,
            polymaxRequestId: id,
            ...payload
          }, '*');
        });
      }

      // Error capture & reporting to host runtime
      window.addEventListener('error', function(event) {
        window.parent.postMessage({
          polymaxAction: 'runtime.error',
          error: {
            message: event.message || 'Unknown error',
            filename: event.filename || '',
            lineno: event.lineno || 0,
            colno: event.colno || 0,
            stack: event.error ? event.error.stack : '',
            timestamp: new Date().toISOString()
          }
        }, '*');
      });

      window.addEventListener('unhandledrejection', function(event) {
        const reason = event.reason;
        window.parent.postMessage({
          polymaxAction: 'runtime.error',
          error: {
            message: reason ? (reason.message || String(reason)) : 'Unhandled Promise Rejection',
            stack: reason && reason.stack ? reason.stack : '',
            timestamp: new Date().toISOString()
          }
        }, '*');
      });

      window.polymax = {
        storage: {
          get: (key) => sendHostRequest('storage.get', { key }),
          set: (key, value) => sendHostRequest('storage.set', { key, value }),
          remove: (key) => sendHostRequest('storage.remove', { key }),
        },
        invoke: (capabilityId, input) => sendHostRequest('capability.invoke', { capabilityId, input }),
        openUrl: (url) => sendHostRequest('openUrl', { url }),
        getContext: () => sendHostRequest('getContext', {}),
        submit: (command) => sendHostRequest('submit', { command }),
        ui: {
          expand: () => sendHostRequest('ui.expand', {}),
          collapse: () => sendHostRequest('ui.collapse', {}),
        }
      };
      // PolyDocks V2 alias
      window.polydocks = window.polymax;
    })();
  </script>
</head>
<body>
  <div id="app"></div>
  <script>
    try {
${jsCode}
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

  const transpiledJs = transpileFeatureCode(options.code);
  const srcdoc = buildFeatureSrcdoc(transpiledJs, options.manifest);

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
        const js = transpileFeatureCode(code);
        srcdoc = buildFeatureSrcdoc(js, manifest);
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
 */
export async function deleteFeature(cityId: string, featureId: string): Promise<void> {
  try {
    const { ensurePluginFilesTable } = await import("./pluginFiles");
    ensurePluginFilesTable();
    const { db } = await import("./db");
    db.query("DELETE FROM plugin_files WHERE workspace_id = ? AND plugin_id = ?").run(cityId, featureId);
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
