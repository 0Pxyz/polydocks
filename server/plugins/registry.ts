import fs from "node:fs";
import path from "node:path";
import { db } from "../workspace/db";
import {
  type PluginManifest,
  validatePluginManifest,
} from "./manifest";

export interface InstalledPluginRecord {
  id: string;
  name: string;
  version: string;
  manifest: PluginManifest;
  enabled: boolean;
  trust: PluginManifest["trust"];
  createdAt: string;
  updatedAt: string;
}

export interface PluginGrantRecord {
  grantId: string;
  pluginId: string;
  permissionType: string;
  scope: string;
  status: "allow_once" | "allow_always" | "denied";
  createdAt: string;
  updatedAt: string;
}

export class PluginRegistry {
  private static instance: PluginRegistry | null = null;

  public static getInstance(): PluginRegistry {
    if (!PluginRegistry.instance) {
      PluginRegistry.instance = new PluginRegistry();
    }
    return PluginRegistry.instance;
  }

  /**
   * Install or update a plugin manifest.
   * Validates manifest schema and apiVersion: 1 before persisting.
   * Versioned write: the previous live row is archived into plugin_versions
   * (superseded) inside the same transaction, so a failed publish keeps the
   * previous version live and rollback can restore it.
   */
  public install(rawManifest: unknown): {
    success: boolean;
    plugin?: InstalledPluginRecord;
    error?: string;
  } {
    const validation = validatePluginManifest(rawManifest);
    if (!validation.success || !validation.data) {
      return { success: false, error: validation.error || "Invalid manifest" };
    }

    const manifest = validation.data;
    const now = new Date().toISOString();

    const existing = db
      .query<{ id: string; created_at: string; manifest_json: string; version: string }, [string]>(
        "SELECT id, created_at, manifest_json, version FROM plugins WHERE id = ?"
      )
      .get(manifest.id);

    const createdAt = existing?.created_at || now;

    const writeTxn = db.transaction(() => {
      // Archive the previous live version before overwriting.
      if (existing) {
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
        `);
        db.query(
          `INSERT INTO plugin_versions (plugin_id, version, workspace_id, manifest_json, source_code, srcdoc, status, created_at)
           VALUES (?, ?, 'default', ?, NULL, '', 'superseded', ?)
           ON CONFLICT(plugin_id, version) DO UPDATE SET status = 'superseded'`
        ).run(existing.id, existing.version, existing.manifest_json, now);
      }

      db.query(
        `INSERT INTO plugins (id, name, version, manifest_json, enabled, trust, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           version = excluded.version,
           manifest_json = excluded.manifest_json,
           trust = excluded.trust,
           updated_at = excluded.updated_at`
      ).run(
        manifest.id,
        manifest.name,
        manifest.version,
        JSON.stringify(manifest),
        1, // enabled by default on install
        manifest.trust,
        createdAt,
        now
      );

      db.query(
        `INSERT INTO plugin_versions (plugin_id, version, workspace_id, manifest_json, source_code, srcdoc, status, created_at)
         VALUES (?, ?, 'default', ?, NULL, '', 'active', ?)
         ON CONFLICT(plugin_id, version) DO UPDATE SET
           manifest_json = excluded.manifest_json,
           status = 'active',
           created_at = excluded.created_at`
      ).run(manifest.id, manifest.version, JSON.stringify(manifest), now);
    });

    try {
      writeTxn();
    } catch (err: any) {
      return { success: false, error: err?.message || "Failed to persist plugin version" };
    }

    return {
      success: true,
      plugin: {
        id: manifest.id,
        name: manifest.name,
        version: manifest.version,
        manifest,
        enabled: true,
        trust: manifest.trust,
        createdAt,
        updatedAt: now,
      },
    };
  }

  /**
   * Uninstall and remove a plugin and all associated grants.
   */
  public uninstall(pluginId: string): boolean {
    const result = db.query("DELETE FROM plugins WHERE id = ?").run(pluginId);
    db.query("DELETE FROM plugin_grants WHERE plugin_id = ?").run(pluginId);
    return result.changes > 0;
  }

  /**
   * Enable an installed plugin.
   */
  public enable(pluginId: string): boolean {
    const now = new Date().toISOString();
    const result = db
      .query("UPDATE plugins SET enabled = 1, updated_at = ? WHERE id = ?")
      .run(now, pluginId);
    return result.changes > 0;
  }

  /**
   * Disable an installed plugin.
   */
  public disable(pluginId: string): boolean {
    const now = new Date().toISOString();
    const result = db
      .query("UPDATE plugins SET enabled = 0, updated_at = ? WHERE id = ?")
      .run(now, pluginId);
    return result.changes > 0;
  }

  /**
   * Get an installed plugin record by ID.
   */
  public get(pluginId: string): InstalledPluginRecord | null {
    const row = db
      .query<
        {
          id: string;
          name: string;
          version: string;
          manifest_json: string;
          enabled: number;
          trust: string;
          created_at: string;
          updated_at: string;
        },
        [string]
      >("SELECT * FROM plugins WHERE id = ?")
      .get(pluginId);

    if (!row) return null;

    try {
      const manifest = JSON.parse(row.manifest_json) as PluginManifest;
      return {
        id: row.id,
        name: row.name,
        version: row.version,
        manifest,
        enabled: Boolean(row.enabled),
        trust: row.trust as PluginManifest["trust"],
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    } catch {
      return null;
    }
  }

  /**
   * Check if a plugin ID is installed.
   */
  public has(pluginId: string): boolean {
    const row = db
      .query<{ count: number }, [string]>(
        "SELECT COUNT(*) as count FROM plugins WHERE id = ?"
      )
      .get(pluginId);
    return Boolean(row && row.count > 0);
  }

  /**
   * List all installed plugins.
   */
  public list(options?: { enabledOnly?: boolean }): InstalledPluginRecord[] {
    const sql = options?.enabledOnly
      ? "SELECT * FROM plugins WHERE enabled = 1 ORDER BY name ASC"
      : "SELECT * FROM plugins ORDER BY name ASC";

    const rows = db
      .query<{
        id: string;
        name: string;
        version: string;
        manifest_json: string;
        enabled: number;
        trust: string;
        created_at: string;
        updated_at: string;
      }, []>(sql)
      .all();

    const plugins: InstalledPluginRecord[] = [];
    for (const row of rows) {
      try {
        const manifest = JSON.parse(row.manifest_json) as PluginManifest;
        plugins.push({
          id: row.id,
          name: row.name,
          version: row.version,
          manifest,
          enabled: Boolean(row.enabled),
          trust: row.trust as PluginManifest["trust"],
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        });
      } catch {
        // Skip corrupted manifests
      }
    }
    return plugins;
  }

  /**
   * Discover and register manifests from a directory on the local filesystem.
   */
  public discoverFromDirectory(dirPath: string): {
    discovered: number;
    errors: string[];
  } {
    if (!fs.existsSync(dirPath)) {
      return { discovered: 0, errors: [`Directory does not exist: ${dirPath}`] };
    }

    let discovered = 0;
    const errors: string[] = [];

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        const manifestFile = path.join(fullPath, "plugin.json");
        if (fs.existsSync(manifestFile)) {
          try {
            const raw = JSON.parse(fs.readFileSync(manifestFile, "utf-8"));
            const res = this.install(raw);
            if (res.success) {
              discovered++;
            } else {
              errors.push(`[${entry.name}] ${res.error}`);
            }
          } catch (err: any) {
            errors.push(`[${entry.name}] Failed to parse plugin.json: ${err.message}`);
          }
        }
      } else if (entry.isFile() && entry.name.endsWith(".plugin.json")) {
        try {
          const raw = JSON.parse(fs.readFileSync(fullPath, "utf-8"));
          const res = this.install(raw);
          if (res.success) {
            discovered++;
          } else {
            errors.push(`[${entry.name}] ${res.error}`);
          }
        } catch (err: any) {
          errors.push(`[${entry.name}] Failed to parse ${entry.name}: ${err.message}`);
        }
      }
    }

    return { discovered, errors };
  }

  /**
   * Record a permission grant for a plugin.
   */
  public recordGrant(
    pluginId: string,
    permissionType: string,
    scope: string,
    status: "allow_once" | "allow_always" | "denied"
  ): PluginGrantRecord {
    const grantId = `grant_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();

    db.query(
      `INSERT OR REPLACE INTO plugin_grants (grant_id, plugin_id, permission_type, scope, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(grantId, pluginId, permissionType, scope, status, now, now);

    return {
      grantId,
      pluginId,
      permissionType,
      scope,
      status,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Alias for recordGrant.
   */
  public grantPermission(
    pluginId: string,
    permissionType: string,
    scope: string,
    status: "allow_once" | "allow_always" | "denied"
  ): PluginGrantRecord {
    return this.recordGrant(pluginId, permissionType, scope, status);
  }

  /**
   * Retrieve active grants for a plugin.
   */
  public getGrants(pluginId: string): PluginGrantRecord[] {
    const rows = db
      .query<
        {
          grant_id: string;
          plugin_id: string;
          permission_type: string;
          scope: string;
          status: string;
          created_at: string;
          updated_at: string;
        },
        [string]
      >("SELECT * FROM plugin_grants WHERE plugin_id = ? ORDER BY created_at DESC")
      .all(pluginId);

    return rows.map((r) => ({
      grantId: r.grant_id,
      pluginId: r.plugin_id,
      permissionType: r.permission_type,
      scope: r.scope,
      status: r.status as PluginGrantRecord["status"],
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  /**
   * Check if an active grant exists.
   */
  public hasGrant(
    pluginId: string,
    permissionType: string,
    scope: string
  ): boolean {
    const row = db
      .query<{ status: string }, [string, string, string]>(
        `SELECT status FROM plugin_grants 
         WHERE plugin_id = ? AND permission_type = ? AND scope = ?
         ORDER BY updated_at DESC LIMIT 1`
      )
      .get(pluginId, permissionType, scope);

    return row?.status === "allow_always" || row?.status === "allow_once";
  }

  /**
   * Revoke a specific grant.
   */
  public revokeGrant(grantId: string): boolean {
    const res = db.query("DELETE FROM plugin_grants WHERE grant_id = ?").run(grantId);
    return res.changes > 0;
  }
}

export const pluginRegistry = PluginRegistry.getInstance();
