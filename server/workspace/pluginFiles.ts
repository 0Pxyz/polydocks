import { db } from "./db";
import fs from "node:fs/promises";
import path from "node:path";
import type { FeatureManifest } from "./features";

export interface PluginFileRow {
  workspaceId: string;
  pluginId: string;
  version: string;
  manifestJson: string;
  sourceCode: string | null;
  srcdoc: string;
  updatedAt: string;
}

export interface PluginFileMigrationConflict {
  workspaceId: string;
  pluginId: string;
  kept: "features" | "tabs";
  keptUpdatedAt?: string;
  droppedUpdatedAt?: string;
}

export interface PluginFileMigrationReport {
  imported: number;
  skipped: number;
  conflicts: PluginFileMigrationConflict[];
}

/**
 * Ensures the plugin_files table exists. Called on every access so
 * existing production databases pick it up without a separate migration.
 * Single source of truth for plugin code: (workspace_id, plugin_id, version).
 */
export function ensurePluginFilesTable(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS plugin_files (
      workspace_id TEXT NOT NULL,
      plugin_id TEXT NOT NULL,
      version TEXT NOT NULL DEFAULT '1.0.0',
      manifest_json TEXT NOT NULL,
      source_code TEXT,
      srcdoc TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (workspace_id, plugin_id, version)
    );
    CREATE INDEX IF NOT EXISTS idx_plugin_files_lookup
      ON plugin_files(workspace_id, plugin_id);
  `);
}

function rowToData(row: PluginFileRow): {
  manifest: FeatureManifest;
  code?: string;
  srcdoc: string;
  version: string;
} {
  return {
    manifest: JSON.parse(row.manifestJson) as FeatureManifest,
    code: row.sourceCode || undefined,
    srcdoc: row.srcdoc,
    version: row.version,
  };
}

/**
 * Writes (upserts) one versioned plugin file row. Never deletes other versions.
 */
export function upsertPluginFile(input: {
  workspaceId: string;
  pluginId: string;
  version?: string;
  manifest: FeatureManifest;
  sourceCode?: string;
  srcdoc: string;
}): { version: string; updatedAt: string } {
  ensurePluginFilesTable();
  const version = input.version || (input.manifest as { version?: string }).version || "1.0.0";
  const updatedAt = new Date().toISOString();
  db.query(
    `INSERT INTO plugin_files (workspace_id, plugin_id, version, manifest_json, source_code, srcdoc, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(workspace_id, plugin_id, version) DO UPDATE SET
       manifest_json = excluded.manifest_json,
       source_code = excluded.source_code,
       srcdoc = excluded.srcdoc,
       updated_at = excluded.updated_at`
  ).run(
    input.workspaceId,
    input.pluginId,
    version,
    JSON.stringify(input.manifest),
    input.sourceCode ?? null,
    input.srcdoc,
    updatedAt
  );
  return { version, updatedAt };
}

/**
 * Reads a plugin file from SQLite. Prefers the exact workspace, then falls
 * back to any workspace holding that plugin id (global sharing). Returns
 * the newest version when version is omitted.
 */
export function getPluginFile(
  pluginId: string,
  workspaceId?: string,
  version?: string
): (ReturnType<typeof rowToData> & { workspaceId: string }) | null {
  ensurePluginFilesTable();
  const tryQuery = (ws?: string) => {
    if (version) {
      const sql = ws
        ? `SELECT workspace_id as workspaceId, plugin_id as pluginId, version, manifest_json as manifestJson, source_code as sourceCode, srcdoc, updated_at as updatedAt FROM plugin_files WHERE workspace_id = ? AND plugin_id = ? AND version = ?`
        : `SELECT workspace_id as workspaceId, plugin_id as pluginId, version, manifest_json as manifestJson, source_code as sourceCode, srcdoc, updated_at as updatedAt FROM plugin_files WHERE plugin_id = ? AND version = ? ORDER BY updated_at DESC LIMIT 1`;
      const args = ws ? [ws, pluginId, version] : [pluginId, version];
      return db.query<any, any[]>(sql).get(...args) as any;
    }
    const sql = ws
      ? `SELECT workspace_id as workspaceId, plugin_id as pluginId, version, manifest_json as manifestJson, source_code as sourceCode, srcdoc, updated_at as updatedAt FROM plugin_files WHERE workspace_id = ? AND plugin_id = ? ORDER BY updated_at DESC LIMIT 1`
      : `SELECT workspace_id as workspaceId, plugin_id as pluginId, version, manifest_json as manifestJson, source_code as sourceCode, srcdoc, updated_at as updatedAt FROM plugin_files WHERE plugin_id = ? ORDER BY updated_at DESC LIMIT 1`;
    const args = ws ? [ws, pluginId] : [pluginId];
    return db.query<any, any[]>(sql).get(...args) as any;
  };

  let raw: any = null;
  if (workspaceId) raw = tryQuery(workspaceId);
  if (!raw) raw = tryQuery(undefined);
  if (!raw) return null;
  const parsed = rowToData({
    workspaceId: raw.workspaceId,
    pluginId: raw.pluginId,
    version: raw.version,
    manifestJson: raw.manifestJson,
    sourceCode: raw.sourceCode,
    srcdoc: raw.srcdoc,
    updatedAt: raw.updatedAt,
  });
  return { ...parsed, workspaceId: raw.workspaceId };
}

/**
 * Lists plugin ids stored in SQLite for a workspace.
 */
export function listPluginFiles(workspaceId: string): Array<{ pluginId: string; version: string }> {
  ensurePluginFilesTable();
  const rows = db
    .query<{ plugin_id: string; version: string }, [string]>(
      `SELECT plugin_id, version FROM plugin_files WHERE workspace_id = ? ORDER BY plugin_id ASC, updated_at DESC`
    )
    .all(workspaceId);
  const seen = new Set<string>();
  const out: Array<{ pluginId: string; version: string }> = [];
  for (const r of rows) {
    if (seen.has(r.plugin_id)) continue;
    seen.add(r.plugin_id);
    out.push({ pluginId: r.plugin_id, version: r.version });
  }
  return out;
}

/**
 * One-time idempotent import of workspace/**\/features and tabs into SQLite.
 * Prefers the newest updatedAt, reports conflicts, never deletes files.
 */
export async function migrateWorkspacePluginFiles(
  workspaceRoot = path.resolve(process.cwd(), "workspace")
): Promise<PluginFileMigrationReport> {
  ensurePluginFilesTable();
  const report: PluginFileMigrationReport = { imported: 0, skipped: 0, conflicts: [] };
  let workspaces: string[] = [];
  try {
    const entries = await fs.readdir(workspaceRoot, { withFileTypes: true });
    workspaces = entries.filter((e) => e.isDirectory() && !e.name.startsWith(".")).map((e) => e.name);
  } catch {
    return report;
  }

  for (const ws of workspaces) {
    const ids = new Set<string>();
    for (const dir of ["features", "tabs"]) {
      try {
        const entries = await fs.readdir(path.join(workspaceRoot, ws, dir));
        for (const id of entries) {
          if (!id.startsWith(".")) ids.add(id);
        }
      } catch {
        // directory may not exist
      }
    }
    for (const id of ids) {
      const candidates: Array<{ kind: "features" | "tabs"; manifest: FeatureManifest; code?: string; srcdoc: string }> = [];
      for (const kind of ["features", "tabs"] as const) {
        try {
          const manifestRaw = await fs.readFile(path.join(workspaceRoot, ws, kind, id, "manifest.json"), "utf-8");
          const manifest = JSON.parse(manifestRaw) as FeatureManifest;
          let code: string | undefined;
          try {
            code = await fs.readFile(path.join(workspaceRoot, ws, kind, id, "feature.ts"), "utf-8");
          } catch {
            // optional
          }
          const srcdoc = await fs.readFile(path.join(workspaceRoot, ws, kind, id, "index.html"), "utf-8");
          candidates.push({ kind, manifest, code, srcdoc });
        } catch {
          // missing side — skip
        }
      }
      if (candidates.length === 0) {
        report.skipped += 1;
        continue;
      }
      candidates.sort((a, b) =>
        String(b.manifest.updatedAt || b.manifest.createdAt || "").localeCompare(
          String(a.manifest.updatedAt || a.manifest.createdAt || "")
        )
      );
      const winner = candidates[0];
      if (candidates.length > 1) {
        report.conflicts.push({
          workspaceId: ws,
          pluginId: id,
          kept: winner.kind,
          keptUpdatedAt: winner.manifest.updatedAt || winner.manifest.createdAt,
          droppedUpdatedAt: candidates[1].manifest.updatedAt || candidates[1].manifest.createdAt,
        });
      }
      const version = (winner.manifest as { version?: string }).version || "1.0.0";
      const existing = getPluginFile(id, ws, version);
      if (existing) {
        const existingUpdatedAt = (existing.manifest.updatedAt || "") as string;
        const winnerUpdatedAt = (winner.manifest.updatedAt || winner.manifest.createdAt || "") as string;
        if (existingUpdatedAt >= winnerUpdatedAt && existingUpdatedAt !== "") {
          report.skipped += 1;
          continue;
        }
      }
      upsertPluginFile({
        workspaceId: ws,
        pluginId: id,
        version,
        manifest: winner.manifest,
        sourceCode: winner.code,
        srcdoc: winner.srcdoc,
      });
      report.imported += 1;
    }
  }
  return report;
}
