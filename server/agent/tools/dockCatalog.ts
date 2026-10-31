import { listWorkspacePlugins } from "../../workspace/workspaces";
import { listRegistryPlugins, getRegistryPlugin } from "../../plugins/communityRegistry";

export type DockCatalogKind = "builtin" | "dynamic" | "plugin" | "store";

export interface DockCatalogEntry {
  id: string;
  title: string;
  description: string;
  icon: string;
  kind: DockCatalogKind;
}

/**
 * Builtin dock items the client can always resolve. Kept in sync with the
 * frontend dock model descriptions (src/lib/dock/dockModel.ts).
 */
export const DOCK_BUILTINS: DockCatalogEntry[] = [
  { id: "agent", title: "Agent", description: "Talk to the dock agent", icon: "agent", kind: "builtin" },
  { id: "browser", title: "Browser", description: "Browse the web with a real browser", icon: "browser", kind: "builtin" },
  { id: "settings", title: "Settings", description: "Dock appearance and theme", icon: "settings", kind: "builtin" },
  { id: "store", title: "Plugin Store", description: "Community plugin store", icon: "store", kind: "builtin" },
  { id: "plugins", title: "Plugins", description: "Installed plugins", icon: "plugins", kind: "builtin" },
];

function scoreEntry(entry: DockCatalogEntry, q: string): number {
  if (!q) return 0;
  const title = entry.title.toLowerCase();
  const description = entry.description.toLowerCase();
  const id = entry.id.toLowerCase();
  if (title.startsWith(q)) return 100;
  if (title.includes(q)) return 50;
  if (id === q) return 40;
  if (id.includes(q)) return 20;
  if (description.includes(q)) return 10;
  return -1;
}

export interface DockSearchOptions {
  query?: string;
  workspaceId?: string;
  workspaceId?: string;
  limit?: number;
}

/**
 * Searches everything the dock can show: builtins, installed workspace
 * plugins, and community store plugins. Read-only: it never touches
 * plugin storage, publish state, or verification code.
 */
export async function searchDockCatalog(
  options: DockSearchOptions = {}
): Promise<DockCatalogEntry[]> {
  const q = (options.query || "").trim().toLowerCase();
  const workspaceId = options.workspaceId || "default";
  const limit = options.limit || 20;

  const entries: DockCatalogEntry[] = [...DOCK_BUILTINS];

  let installedIds = new Set<string>();
  try {
    const installed = listWorkspacePlugins(workspaceId);
    installedIds = new Set(installed.map((p) => p.pluginId));
    for (const item of installed) {
      if (!entries.some((e) => e.id === item.pluginId)) {
        entries.push({
          id: item.pluginId,
          title: item.plugin?.name || item.pluginId,
          description: item.plugin?.description || "Installed workspace plugin",
          icon: item.plugin?.icon || item.pluginId,
          kind: "plugin",
        });
      }
    }
  } catch {
    // Without workspace data only builtins and tabs are searchable.
  }

  try {
    const registry = listRegistryPlugins(q ? { search: q } : undefined);
    for (const item of registry) {
      if (installedIds.has(item.id)) continue;
      if (entries.some((e) => e.id === item.id)) continue;
      entries.push({
        id: item.id,
        title: item.name,
        description: item.description || "Community plugin",
        icon: item.icon || item.id,
        kind: "store",
      });
    }
  } catch {
    // Store outages never break dock search.
  }

  const ranked = entries
    .map((entry) => ({ entry, score: scoreEntry(entry, q) }))
    .filter((row) => row.score >= 0)
    .sort((a, b) => b.score - a.score)
    .map((row) => row.entry);

  return ranked.slice(0, limit);
}

export interface DockTargetResolution {
  entry?: DockCatalogEntry;
  error?: string;
}

/**
 * Validates that a dock id refers to something real before a pin/unpin/close
 * directive is emitted. Store-only plugins resolve with kind "store" so the
 * caller can tell the agent to install first instead of failing silently.
 */
export async function resolveDockTarget(
  id: string,
  options: { workspaceId?: string } = {}
): Promise<DockTargetResolution> {
  const normalized = id.trim();
  if (!normalized) return { error: "No dock item id was given." };

  const builtin = DOCK_BUILTINS.find((e) => e.id === normalized);
  if (builtin) return { entry: builtin };

  const workspaceId = options.workspaceId || "default";

  try {
    const installed = listWorkspacePlugins(workspaceId);
    const found = installed.find((p) => p.pluginId === normalized);
    if (found) {
      return {
        entry: {
          id: found.pluginId,
          title: found.plugin?.name || found.pluginId,
          description: found.plugin?.description || "Installed workspace plugin",
          icon: found.plugin?.icon || found.pluginId,
          kind: "plugin",
        },
      };
    }
  } catch {
    // Fall through to the registry check.
  }

  try {
    const item = getRegistryPlugin(normalized);
    if (item) {
      return {
        entry: {
          id: item.id,
          title: item.name,
          description: item.description || "Community plugin",
          icon: item.icon || item.id,
          kind: "store",
        },
      };
    }
  } catch {
    // Fall through to the not-found error.
  }

  return { error: `No dock item "${normalized}" found.` };
}
