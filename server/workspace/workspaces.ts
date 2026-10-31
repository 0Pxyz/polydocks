import { db } from "./db";
import { PluginRegistry, type InstalledPluginRecord } from "../plugins/registry";

export interface WorkspaceRecord {
  id: string;
  name: string;
  description: string;
  icon: string;
  kind: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspacePluginRecord {
  workspaceId: string;
  pluginId: string;
  enabled: boolean;
  position: number;
  settings: Record<string, unknown>;
  installedAt: string;
  plugin?: InstalledPluginRecord;
}

/**
 * Ensures at least one default workspace exists in the system.
 */
export function ensureDefaultWorkspace(): WorkspaceRecord {
  // Ensure schema tables exist even if migration hasn't run yet
  db.exec(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      icon TEXT DEFAULT 'Briefcase',
      kind TEXT NOT NULL DEFAULT 'workspace',
      is_default INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workspace_plugins (
      workspace_id TEXT NOT NULL,
      plugin_id TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      position INTEGER DEFAULT 0,
      settings_json TEXT,
      installed_at TEXT NOT NULL,
      PRIMARY KEY (workspace_id, plugin_id),
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
      FOREIGN KEY (plugin_id) REFERENCES plugins(id) ON DELETE CASCADE
    );

    -- Dock pins: server record of pinned items per workspace scope.
    -- The client keeps its own pin cache; this table is the durable truth
    -- the agent, CLI and routes share (pin persists across sessions).
    CREATE TABLE IF NOT EXISTS dock_pins (
      workspace_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      pinned_at TEXT NOT NULL,
      PRIMARY KEY (workspace_id, item_id)
    );
  `);

  // Additive migration for pre-kind databases: default existing rows, then
  // carry the column going forward. Reversible (DROP COLUMN kind restores).
  try {
    db.exec("ALTER TABLE workspaces ADD COLUMN kind TEXT NOT NULL DEFAULT 'workspace';");
  } catch {
    // Column already exists.
  }

  const existingDefault = db
    .query<any, []>("SELECT * FROM workspaces WHERE is_default = 1 LIMIT 1")
    .get();

  if (existingDefault) {
    return {
      id: existingDefault.id,
      name: existingDefault.name,
      description: existingDefault.description || "",
      icon: existingDefault.icon || "Briefcase",
      kind: existingDefault.kind || "workspace",
      isDefault: Boolean(existingDefault.is_default),
      createdAt: existingDefault.created_at,
      updatedAt: existingDefault.updated_at,
    };
  }

  const anyExisting = db
    .query<any, []>("SELECT * FROM workspaces ORDER BY created_at ASC LIMIT 1")
    .get();

  if (anyExisting) {
    return {
      id: anyExisting.id,
      name: anyExisting.name,
      description: anyExisting.description || "",
      icon: anyExisting.icon || "Briefcase",
      kind: anyExisting.kind || "workspace",
      isDefault: Boolean(anyExisting.is_default),
      createdAt: anyExisting.created_at,
      updatedAt: anyExisting.updated_at,
    };
  }

  const now = new Date().toISOString();
  const defaultWs: WorkspaceRecord = {
    id: "default",
    name: "Focus Hub",
    description: "Primary workspace for agentic tools and plugins",
    icon: "Briefcase",
    kind: "workspace",
    isDefault: true,
    createdAt: now,
    updatedAt: now,
  };

  db.query(`
    INSERT INTO workspaces (id, name, description, icon, kind, is_default, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'workspace', 1, ?, ?)
  `).run(
    defaultWs.id,
    defaultWs.name,
    defaultWs.description,
    defaultWs.icon,
    defaultWs.createdAt,
    defaultWs.updatedAt
  );

  return defaultWs;
}

/**
 * Lists all workspaces.
 */
export function listWorkspaces(): WorkspaceRecord[] {
  ensureDefaultWorkspace();
  const rows = db.query<any, []>("SELECT * FROM workspaces ORDER BY is_default DESC, name ASC").all();
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description || "",
    icon: r.icon || "Briefcase",
    kind: r.kind || "workspace",
    isDefault: Boolean(r.is_default),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

/**
 * Gets a workspace by ID.
 */
export function getWorkspace(id: string): WorkspaceRecord | null {
  ensureDefaultWorkspace();
  const r = db.query<any, [string]>("SELECT * FROM workspaces WHERE id = ?").get(id);
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    description: r.description || "",
    icon: r.icon || "Briefcase",
    kind: r.kind || "workspace",
    isDefault: Boolean(r.is_default),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/**
 * Creates a new workspace.
 */
export function createWorkspace(input: {
  id?: string;
  name: string;
  description?: string;
  icon?: string;
  kind?: string;
  isDefault?: boolean;
}): WorkspaceRecord {
  ensureDefaultWorkspace();
  const now = new Date().toISOString();
  const id = input.id || input.name.toLowerCase().replace(/[^a-z0-9_-]/g, "-").replace(/-+/g, "-") || `ws-${Date.now()}`;
  const name = input.name.trim();
  const description = input.description?.trim() || "";
  const icon = input.icon?.trim() || "Briefcase";
  const kind = input.kind?.trim() || "workspace";
  const isDefault = Boolean(input.isDefault);

  db.query(`
    INSERT INTO workspaces (id, name, description, icon, kind, is_default, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, description, icon, kind, isDefault ? 1 : 0, now, now);

  return {
    id,
    name,
    description,
    icon,
    kind,
    isDefault,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Updates an existing workspace.
 */
export function updateWorkspace(
  id: string,
  updates: Partial<{ name: string; description: string; icon: string }>
): WorkspaceRecord | null {
  const current = getWorkspace(id);
  if (!current) return null;

  const now = new Date().toISOString();
  const name = updates.name !== undefined ? updates.name.trim() : current.name;
  const description = updates.description !== undefined ? updates.description.trim() : current.description;
  const icon = updates.icon !== undefined ? updates.icon.trim() : current.icon;

  db.query(`
    UPDATE workspaces
    SET name = ?, description = ?, icon = ?, updated_at = ?
    WHERE id = ?
  `).run(name, description, icon, now, id);

  return {
    ...current,
    name,
    description,
    icon,
    updatedAt: now,
  };
}

/**
 * Deletes a workspace unless it is marked as default.
 */
export function deleteWorkspace(id: string): { success: boolean; error?: string } {
  const ws = getWorkspace(id);
  if (!ws) return { success: false, error: "Workspace not found" };
  if (ws.isDefault) return { success: false, error: "Cannot delete the default workspace" };

  db.query("DELETE FROM workspace_plugins WHERE workspace_id = ?").run(id);
  db.query("DELETE FROM workspaces WHERE id = ?").run(id);
  return { success: true };
}

/**
 * Lists plugins installed in a specific workspace.
 */
export function listWorkspacePlugins(workspaceId: string): WorkspacePluginRecord[] {
  ensureDefaultWorkspace();
  const rows = db.query<any, [string]>(`
    SELECT * FROM workspace_plugins
    WHERE workspace_id = ?
    ORDER BY position ASC, installed_at ASC
  `).all(workspaceId);

  const registry = PluginRegistry.getInstance();
  const allInstalled = registry.list();
  const map = new Map(allInstalled.map((p) => [p.id, p]));

  return rows.map((r) => {
    let settings: Record<string, unknown> = {};
    try {
      if (r.settings_json) settings = JSON.parse(r.settings_json);
    } catch {
      // ignore
    }
    return {
      workspaceId: r.workspace_id,
      pluginId: r.plugin_id,
      enabled: Boolean(r.enabled),
      position: r.position ?? 0,
      settings,
      installedAt: r.installed_at,
      plugin: map.get(r.plugin_id),
    };
  });
}

/**
 * Installs / links a plugin to a workspace.
 */
export function addPluginToWorkspace(
  workspaceId: string,
  pluginId: string,
  settings: Record<string, unknown> = {},
  position = 0
): WorkspacePluginRecord {
  ensureDefaultWorkspace();
  const now = new Date().toISOString();
  db.query(`
    INSERT OR REPLACE INTO workspace_plugins (workspace_id, plugin_id, enabled, position, settings_json, installed_at)
    VALUES (?, ?, 1, ?, ?, ?)
  `).run(workspaceId, pluginId, position, JSON.stringify(settings), now);

  const registry = PluginRegistry.getInstance();
  const plugin = registry.get(pluginId) || undefined;

  return {
    workspaceId,
    pluginId,
    enabled: true,
    position,
    settings,
    installedAt: now,
    plugin,
  };
}

/**
 * Removes a plugin from a workspace.
 */
export function removePluginFromWorkspace(workspaceId: string, pluginId: string): boolean {
  const result = db.query(`
    DELETE FROM workspace_plugins
    WHERE workspace_id = ? AND plugin_id = ?
  `).run(workspaceId, pluginId);
  return result.changes > 0;
}

/**
 * Toggles a plugin's enabled status within a specific workspace.
 */
export function setWorkspacePluginStatus(
  workspaceId: string,
  pluginId: string,
  enabled: boolean
): boolean {
  const result = db.query(`
    UPDATE workspace_plugins
    SET enabled = ?
    WHERE workspace_id = ? AND plugin_id = ?
  `).run(enabled ? 1 : 0, workspaceId, pluginId);
  return result.changes > 0;
}

/**
 * Dock pins: durable pin record per workspace scope, shared by the agent,
 * CLI and routes. The client keeps its own pin cache for instant layout;
 * this table is the truth that survives sessions, reloads and reinstalls.
 */
export function pinDockItem(workspaceId: string, itemId: string): void {
  ensureDefaultWorkspace();
  db.query(
    `INSERT OR IGNORE INTO dock_pins (workspace_id, item_id, pinned_at) VALUES (?, ?, ?)`
  ).run(workspaceId, itemId, new Date().toISOString());
}

export function unpinDockItem(workspaceId: string, itemId: string): boolean {
  ensureDefaultWorkspace();
  const result = db.query(
    `DELETE FROM dock_pins WHERE workspace_id = ? AND item_id = ?`
  ).run(workspaceId, itemId);
  return result.changes > 0;
}

export function listDockPins(workspaceId: string): string[] {
  ensureDefaultWorkspace();
  const rows = db.query(
    `SELECT item_id FROM dock_pins WHERE workspace_id = ? ORDER BY pinned_at ASC`
  ).all(workspaceId) as Array<{ item_id: string }>;
  return rows.map((r) => r.item_id);
}

export function isDockPinned(workspaceId: string, itemId: string): boolean {
  ensureDefaultWorkspace();
  const row = db.query(
    `SELECT 1 as one FROM dock_pins WHERE workspace_id = ? AND item_id = ?`
  ).get(workspaceId, itemId) as any;
  return Boolean(row?.one);
}
