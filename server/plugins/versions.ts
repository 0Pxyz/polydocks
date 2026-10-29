import { db } from "../workspace/db";

export interface PluginVersionRecord {
  pluginId: string;
  version: string;
  workspaceId: string;
  manifestJson: string;
  sourceCode: string | null;
  srcdoc: string | null;
  status: "active" | "superseded" | "draft" | "failed";
  createdAt: string;
}

export function ensurePluginVersionsTable(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS plugin_versions (
      plugin_id TEXT NOT NULL,
      version TEXT NOT NULL,
      workspace_id TEXT NOT NULL DEFAULT 'default',
      manifest_json TEXT NOT NULL,
      source_code TEXT,
      srcdoc TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      PRIMARY KEY (plugin_id, version)
    );
    CREATE INDEX IF NOT EXISTS idx_plugin_versions_lookup
      ON plugin_versions(plugin_id, status);
  `);
}

/**
 * Records one version row. Never deletes other versions.
 */
export function saveVersion(input: {
  pluginId: string;
  version: string;
  workspaceId?: string;
  manifestJson: string;
  sourceCode?: string | null;
  srcdoc?: string | null;
  status?: PluginVersionRecord["status"];
}): void {
  ensurePluginVersionsTable();
  const now = new Date().toISOString();
  db.query(
    `INSERT INTO plugin_versions (plugin_id, version, workspace_id, manifest_json, source_code, srcdoc, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(plugin_id, version) DO UPDATE SET
       manifest_json = excluded.manifest_json,
       source_code = excluded.source_code,
       srcdoc = excluded.srcdoc,
       status = excluded.status,
       created_at = excluded.created_at`
  ).run(
    input.pluginId,
    input.version,
    input.workspaceId || "default",
    input.manifestJson,
    input.sourceCode ?? null,
    input.srcdoc ?? "",
    input.status || "active",
    now
  );
}

/**
 * Lists version history newest-first.
 */
export function listVersions(pluginId: string): PluginVersionRecord[] {
  ensurePluginVersionsTable();
  const rows = db
    .query<any, [string]>(
      `SELECT plugin_id, version, workspace_id, manifest_json, source_code, srcdoc, status, created_at
       FROM plugin_versions WHERE plugin_id = ? ORDER BY created_at DESC`
    )
    .all(pluginId);
  return rows.map((r) => ({
    pluginId: r.plugin_id,
    version: r.version,
    workspaceId: r.workspace_id,
    manifestJson: r.manifest_json,
    sourceCode: r.source_code,
    srcdoc: r.srcdoc,
    status: r.status,
    createdAt: r.created_at,
  }));
}

/**
 * Internal rollback: reactivate a previous version in the live plugins table.
 * Not exposed as an agent tool.
 */
export function rollbackPlugin(
  pluginId: string,
  targetVersion?: string
): { success: boolean; version?: string; error?: string } {
  ensurePluginVersionsTable();
  const history = listVersions(pluginId);
  if (history.length === 0) return { success: false, error: `No version history for "${pluginId}"` };
  const target =
    (targetVersion ? history.find((v) => v.version === targetVersion) : undefined) ||
    history.find((v) => v.status === "superseded") ||
    history[0];
  if (!target) return { success: false, error: `Version not found for "${pluginId}"` };
  try {
    const manifest = JSON.parse(target.manifestJson) as { name?: string; trust?: string };
    const now = new Date().toISOString();
    db.query(
      `UPDATE plugins SET name = ?, version = ?, manifest_json = ?, updated_at = ? WHERE id = ?`
    ).run(manifest.name || pluginId, target.version, target.manifestJson, now, pluginId);
    db.query(`UPDATE plugin_versions SET status = 'superseded' WHERE plugin_id = ?`).run(pluginId);
    db.query(`UPDATE plugin_versions SET status = 'active' WHERE plugin_id = ? AND version = ?`).run(
      pluginId,
      target.version
    );
    return { success: true, version: target.version };
  } catch (err: any) {
    return { success: false, error: err?.message || "Rollback failed" };
  }
}

/**
 * Atomically activates a validated draft: marks previous active superseded,
 * writes the new live row. On failure the previous version stays live.
 */
export function activateVersion(input: {
  pluginId: string;
  version: string;
  workspaceId?: string;
  manifestJson: string;
  sourceCode?: string | null;
  srcdoc?: string | null;
}): { success: boolean; error?: string } {
  ensurePluginVersionsTable();
  const activate = db.transaction(() => {
    db.query(`UPDATE plugin_versions SET status = 'superseded' WHERE plugin_id = ? AND status = 'active'`).run(
      input.pluginId
    );
    saveVersion({ ...input, status: "active" });
  });
  try {
    activate();
    return { success: true };
  } catch (err: any) {
    try {
      saveVersion({ ...input, status: "failed" });
    } catch {
      // Non-fatal
    }
    return { success: false, error: err?.message || "Activation failed" };
  }
}
