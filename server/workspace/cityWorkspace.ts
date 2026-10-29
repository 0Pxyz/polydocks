import fs from "node:fs/promises";
import path from "node:path";
import { db } from "./db";

/**
 * Resolves a target path safely inside the specified city workspace.
 * Defends against path traversal (../) and symlink directory escapes.
 */
export async function resolveSafeCityPath(cityId: string, relativePath: string): Promise<string> {
  if (!cityId || cityId.includes("..") || path.isAbsolute(cityId)) {
    throw new Error(`Security Violation: Invalid city identifier "${cityId}"`);
  }

  const workspaceRoot = path.resolve(process.cwd(), "workspace");
  const cityRoot = path.resolve(workspaceRoot, cityId);
  const targetPath = path.resolve(cityRoot, relativePath);

  // Path traversal check
  if (!targetPath.startsWith(cityRoot)) {
    throw new Error(`Security Violation: Path traversal detected outside city "${cityId}"`);
  }

  // Ensure city directory exists
  await fs.mkdir(cityRoot, { recursive: true });

  // Symlink escape defense
  try {
    const realRoot = await fs.realpath(cityRoot);
    const realTarget = await fs.realpath(targetPath);
    if (!realTarget.startsWith(realRoot)) {
      throw new Error(`Security Violation: Symlink escape detected in city "${cityId}"`);
    }
  } catch (err: any) {
    if (err.code !== "ENOENT") {
      throw err;
    }
  }

  return targetPath;
}

export interface CityContext {
  cityId: string;
  metadata?: Record<string, unknown>;
  workspace?: Record<string, unknown>;
  notes: string[];
  sources: string[];
  tabs: string[];
  features?: string[];
}

/**
 * Retrieves the filesystem-based context of a city workspace, merged with
 * the SQLite plugin store so DB-only plugins (the source of truth after the
 * plugin_files migration) are visible even when workspace/ is ephemeral.
 */
export async function getCityContext(cityId: string): Promise<CityContext> {
  const cityRoot = await resolveSafeCityPath(cityId, ".");

  let metadata: Record<string, unknown> | undefined;
  let workspace: Record<string, unknown> | undefined;

  try {
    const raw = await fs.readFile(path.join(cityRoot, "city.json"), "utf-8");
    metadata = JSON.parse(raw);
  } catch {
    // City descriptor optional or generated later
  }

  try {
    const raw = await fs.readFile(path.join(cityRoot, "workspace.json"), "utf-8");
    workspace = JSON.parse(raw);
  } catch {
    // Workspace layout optional
  }

  const listDirFiles = async (sub: string) => {
    try {
      const dirPath = path.join(cityRoot, sub);
      const entries = await fs.readdir(dirPath);
      return entries.filter((e) => !e.startsWith("."));
    } catch {
      return [];
    }
  };

  const [notes, sources, legacyTabs, featureDirs] = await Promise.all([
    listDirFiles("notes"),
    listDirFiles("sources"),
    listDirFiles("tabs"),
    listDirFiles("features"),
  ]);

  // SQLite plugin store first: plugin code lives in DATA_DIR, which survives
  // redeploys, while workspace/ files do not.
  let dbPluginIds: string[] = [];
  try {
    const { listPluginFiles } = await import("./pluginFiles");
    dbPluginIds = listPluginFiles(cityId).map((e) => e.pluginId);
  } catch {
    // Table may not exist yet in very old flows; filesystem wins.
  }

  const allTabs = Array.from(new Set([...featureDirs, ...legacyTabs, ...dbPluginIds]));

  return {
    cityId,
    metadata,
    workspace,
    notes,
    sources,
    tabs: allTabs,
    features: Array.from(new Set([...featureDirs, ...dbPluginIds])),
  };
}

/**
 * Safely reads a file from the city workspace.
 */
export async function readCityFile(cityId: string, relativePath: string): Promise<string> {
  const safePath = await resolveSafeCityPath(cityId, relativePath);
  return await fs.readFile(safePath, "utf-8");
}

/**
 * Safely writes a file to the city workspace.
 */
export async function writeCityFile(
  cityId: string,
  relativePath: string,
  content: string
): Promise<string> {
  const safePath = await resolveSafeCityPath(cityId, relativePath);
  await fs.mkdir(path.dirname(safePath), { recursive: true });
  await fs.writeFile(safePath, content, "utf-8");
  return safePath;
}

/**
 * Safely deletes a file from the city workspace.
 */
export async function deleteCityFile(cityId: string, relativePath: string): Promise<void> {
  const safePath = await resolveSafeCityPath(cityId, relativePath);
  await fs.unlink(safePath);
}

export interface OpenSourceItem {
  title?: string;
  url: string;
  kind?: string;
  openedAt: string;
  questId?: string;
}

export interface WorkspaceState {
  activeTab?: string;
  currentURL?: string;
  openSources?: OpenSourceItem[];
  activeQuestId?: string;
  lastIntent?: {
    tabId: string;
    url?: string;
    payload?: Record<string, unknown>;
    timestamp: string;
  };
  pinnedTabs?: string[];
  updatedAt?: string;
  [key: string]: unknown;
}

/**
 * Retrieves the persisted workspace.json state of a city.
 */
export async function getWorkspaceState(cityId: string): Promise<WorkspaceState> {
  try {
    const raw = await readCityFile(cityId, "workspace.json");
    return JSON.parse(raw) as WorkspaceState;
  } catch {
    return {
      activeTab: "browser",
      openSources: [],
    };
  }
}

/**
 * Updates the persisted workspace.json state of a city.
 */
export async function updateWorkspaceState(
  cityId: string,
  updates: Partial<WorkspaceState>
): Promise<WorkspaceState> {
  const current = await getWorkspaceState(cityId);
  const updated: WorkspaceState = {
    ...current,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  if (updates.openSources) {
    const mergedMap = new Map<string, OpenSourceItem>();
    for (const src of current.openSources || []) {
      mergedMap.set(src.url, src);
    }
    for (const src of updates.openSources) {
      mergedMap.set(src.url, src);
    }
    updated.openSources = Array.from(mergedMap.values());
  }

  await writeCityFile(cityId, "workspace.json", JSON.stringify(updated, null, 2));
  return updated;
}

/**
 * Appends an entry to both the SQLite audit trail and the file-based audit log.
 */
export async function appendAuditLog(
  cityId: string,
  action: string,
  details: Record<string, unknown>
): Promise<void> {
  const timestamp = new Date().toISOString();
  const serialized = JSON.stringify(details);

  try {
    const stmt = db.prepare(
      "INSERT INTO audit_log (city_id, action, details, created_at) VALUES (?, ?, ?, ?)"
    );
    stmt.run(cityId, action, serialized, timestamp);
  } catch {
    // Non-fatal if DB write encounters issues
  }

  try {
    const workspaceRoot = path.resolve(process.cwd(), "workspace");
    await fs.mkdir(workspaceRoot, { recursive: true });
    const logLine = `[${timestamp}] [city:${cityId}] [${action}] ${serialized}\n`;
    await fs.appendFile(path.join(workspaceRoot, ".audit.log"), logLine, "utf-8");
  } catch {
    // Non-fatal
  }
}

