import { db } from "../workspace/db";
import { PluginRegistry } from "./registry";
import { getPluginFile } from "../workspace/pluginFiles";
import { recordExperienceError } from "../workspace/experienceErrors";

export interface VerifyCheck {
  name: "registry" | "mount" | "manifest" | "srcdoc";
  ok: boolean;
  detail?: string;
}

export interface VerifyResult {
  ok: boolean;
  pluginId: string;
  workspaceId: string;
  checks: VerifyCheck[];
  error?: string;
}

/**
 * Normalizes a plugin/tab id for duplicate checks.
 */
export function normalizePluginId(id: string): string {
  return (id || "").toLowerCase().trim();
}

/**
 * Cross-namespace duplicate check: registry + tab/plugin file namespaces
 * across all scopes. Ids are normalized to lowercase first.
 */
export function isPluginIdTaken(id: string): { taken: boolean; namespaces: string[] } {
  const normalized = normalizePluginId(id);
  const namespaces: string[] = [];

  try {
    const row = db
      .query<{ count: number }, [string]>(`SELECT COUNT(*) as count FROM plugins WHERE id = ?`)
      .get(normalized);
    if (row && row.count > 0) namespaces.push("registry");
  } catch {
    // table may not exist in ancient flows
  }

  try {
    const row = db
      .query<{ count: number }, [string]>(
        `SELECT COUNT(*) as count FROM plugin_files WHERE plugin_id = ?`
      )
      .get(normalized);
    if (row && row.count > 0) namespaces.push("plugin_files");
  } catch {
    // table created lazily
  }

  return { taken: namespaces.length > 0, namespaces };
}

/**
 * Ensures a tab/plugin id has a registry row and a workspace mount, so
 * verification can pass for tab-namespace experiences that were written
 * directly to plugin_files. Idempotent.
 */
export interface EquivalentPlugin {
  id: string;
  name: string;
  /** Where the match was found: registry row vs workspace install. */
  where: "registry" | "workspace";
}

/** Normalizes names for equivalence: case/punctuation/space-insensitive. */
export function normalizePluginName(name: string): string {
  return (name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Numeric-suffix stem ("aiagentsfeed2" -> "aiagentsfeed"): the classic
 * repeat-synthesis pattern is the same name with a suffixed slug.
 * Stems shorter than 3 chars never match (avoids "a2" == "a").
 */
export function stemPluginName(normalized: string): string {
  const stem = normalized.replace(/[0-9]+$/, "");
  return stem.length >= 3 ? stem : normalized;
}

/**
 * Registry equivalence check (#346): finds an already-installed plugin with
 * the same normalized name or id stem, even when the requested slug differs
 * ("AI Agents Feed" vs "ai-agents-feed-2"). The agent only sees pinned dock
 * items, so this server-side guard is what stops duplicate synthesis.
 */
export function findEquivalentPlugins(
  nameOrId: string,
  excludeId?: string
): EquivalentPlugin[] {
  const needle = normalizePluginName(nameOrId);
  if (!needle) return [];
  const excluded = excludeId ? normalizePluginId(excludeId) : "";
  const found = new Map<string, EquivalentPlugin>();
  const needleStem = stemPluginName(needle);
  const consider = (id: string, name: string, where: EquivalentPlugin["where"]) => {
    if (!id || normalizePluginId(id) === excluded) return;
    const candidates = [normalizePluginName(id), normalizePluginName(name)];
    if (
      candidates.includes(needle) ||
      candidates.map(stemPluginName).includes(needleStem)
    ) {
      if (!found.has(id)) found.set(id, { id, name, where });
    }
  };
  try {
    const rows = db
      .query<{ id: string; name: string }, []>(`SELECT id, name FROM plugins`)
      .all();
    for (const row of rows) consider(row.id, row.name, "registry");
  } catch {
    // table may not exist in ancient flows
  }
  try {
    const rows = db
      .query<{ plugin_id: string }, []>(`SELECT DISTINCT plugin_id FROM workspace_plugins`)
      .all();
    for (const row of rows) consider(row.plugin_id, row.plugin_id, "workspace");
  } catch {
    // table created lazily
  }
  return [...found.values()];
}

export function ensurePluginRegisteredAndMounted(
  pluginId: string,
  workspaceId: string,
  manifest: { title?: string; icon?: string; description?: string; version?: string }
): void {
  const id = normalizePluginId(pluginId);
  const registry = PluginRegistry.getInstance();
  if (!registry.get(id)) {
    registry.install({
      apiVersion: 1,
      id,
      name: manifest.title || id,
      version: manifest.version || "1.0.0",
      description: manifest.description || manifest.title || id,
      icon: manifest.icon || "Layers",
      trust: "generated",
      capabilities: [],
      surfaces: [],
      permissions: [],
    });
  }
  try {
    db.query(
      `INSERT OR IGNORE INTO workspace_plugins (workspace_id, plugin_id, enabled, position, installed_at)
       VALUES (?, ?, 1, 0, ?)`
    ).run(workspaceId, id, new Date().toISOString());
  } catch {
    // workspaces table may not exist in ancient flows; verification reports it.
  }
}

/**
 * Verifies a published plugin/tab end to end: registry row, workspace mount,
 * manifest parses, srcdoc builds non-empty. On failure the reason is recorded
 * as a visible experience error (same pattern as the theme client path:
 * the error is persisted where the UI surfaces it).
 */
export function verifyPluginState(pluginId: string, workspaceId: string): VerifyResult {
  const id = normalizePluginId(pluginId);
  const ws = workspaceId || "default";
  const checks: VerifyCheck[] = [];

  const registry = PluginRegistry.getInstance();
  const record = registry.get(id);
  checks.push({
    name: "registry",
    ok: Boolean(record),
    detail: record ? `v${record.version}` : "no registry row",
  });

  let mountOk = false;
  let mountDetail = "not mounted in workspace";
  try {
    const row = db
      .query<{ count: number }, [string, string]>(
        `SELECT COUNT(*) as count FROM workspace_plugins WHERE workspace_id = ? AND plugin_id = ?`
      )
      .get(ws, id);
    mountOk = Boolean(row && row.count > 0);
    if (!mountOk) {
      const elsewhere = db
        .query<{ workspace_id: string }, [string]>(
          `SELECT workspace_id FROM workspace_plugins WHERE plugin_id = ? LIMIT 5`
        )
        .all(id);
      if (elsewhere.length > 0) {
        mountDetail = `mounted elsewhere: ${elsewhere.map((r) => r.workspace_id).join(", ")}`;
      }
    } else {
      mountDetail = "mounted";
    }
  } catch {
    mountDetail = "workspace_plugins unavailable";
  }
  checks.push({ name: "mount", ok: mountOk, detail: mountDetail });

  let manifestOk = false;
  let manifestDetail = "manifest does not parse";
  try {
    if (record?.manifest && typeof record.manifest.id === "string") {
      manifestOk = true;
      manifestDetail = "manifest parses";
    } else {
      const stored = getPluginFile(id, ws);
      if (stored?.manifest && typeof stored.manifest.id === "string") {
        manifestOk = true;
        manifestDetail = "manifest parses (from plugin_files)";
      }
    }
  } catch (err: any) {
    manifestDetail = err?.message || manifestDetail;
  }
  checks.push({ name: "manifest", ok: manifestOk, detail: manifestDetail });

  let srcdocOk = false;
  let srcdocDetail = "srcdoc empty or missing";
  try {
    const stored = getPluginFile(id, ws);
    if (stored && typeof stored.srcdoc === "string" && stored.srcdoc.trim().length > 0) {
      srcdocOk = true;
      srcdocDetail = `${stored.srcdoc.length} bytes`;
    }
  } catch (err: any) {
    srcdocDetail = err?.message || srcdocDetail;
  }
  checks.push({ name: "srcdoc", ok: srcdocOk, detail: srcdocDetail });

  const failed = checks.find((c) => !c.ok);
  const result: VerifyResult = {
    ok: !failed,
    pluginId: id,
    workspaceId: ws,
    checks,
    error: failed ? `verify:${failed.name} failed for "${id}" in "${ws}" (${failed.detail})` : undefined,
  };

  if (failed) {
    try {
      recordExperienceError(id, ws, { message: result.error || "Plugin verification failed" });
    } catch {
      // Non-fatal
    }
  }

  return result;
}

/**
 * Async variant that also consults the filesystem migration fallback for
 * srcdoc (covers workspaces not yet imported into SQLite).
 */
export async function verifyPluginStateAsync(
  pluginId: string,
  workspaceId: string
): Promise<VerifyResult> {
  const base = verifyPluginState(pluginId, workspaceId);
  const srcdocCheck = base.checks.find((c) => c.name === "srcdoc");
  if (srcdocCheck?.ok) return base;
  try {
    const { readFeature } = await import("../workspace/features");
    const feat = await readFeature(workspaceId, normalizePluginId(pluginId));
    if (feat?.srcdoc && feat.srcdoc.trim().length > 0) {
      srcdocCheck!.ok = true;
      srcdocCheck!.detail = `${feat.srcdoc.length} bytes (filesystem fallback)`;
      const stillFailed = base.checks.find((c) => !c.ok);
      base.ok = !stillFailed;
      base.error = stillFailed
        ? `verify:${stillFailed.name} failed for "${base.pluginId}" in "${base.workspaceId}" (${stillFailed.detail})`
        : undefined;
    }
  } catch {
    // keep failure
  }
  if (!base.ok && base.error) {
    try {
      recordExperienceError(base.pluginId, base.workspaceId, { message: base.error });
    } catch {
      // Non-fatal
    }
  }
  return base;
}

// The sync checker reports DB state only; async callers that need the
// filesystem migration fallback use verifyPluginStateAsync.
