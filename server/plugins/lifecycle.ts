import { PluginRegistry } from "./registry";
import { listRegistryPlugins } from "./communityRegistry";
import { db } from "../workspace/db";
import { findLifecycleViolations } from "./validate";

/**
 * Platform tab-lifecycle contract surface (issue #139).
 *
 * Enumerates every plugin the contract applies to — first-party,
 * agent-generated (SQLite `plugins` + `plugin_files`) and community —
 * so the contract test suite automatically covers newly added plugins.
 * Validation of guest code reuses the same hard rules `create_plugin`
 * enforces (internal-docs/plugins/lifecycle.md).
 */

export type ContractPluginKind = "first-party" | "generated" | "community" | "workspace";

export interface ContractPlugin {
  id: string;
  kind: ContractPluginKind;
  /** Guest TSX source when the plugin ships code (null for manifest-only). */
  code: string | null;
}

function kindFor(trust: string | undefined): ContractPluginKind {
  if (trust === "first-party") return "first-party";
  if (trust === "core") return "first-party";
  return "generated";
}

/**
 * Every plugin the lifecycle contract governs. Reads the live stores —
 * never a hardcoded list — so a newly added plugin joins the suite.
 */
export function listContractPlugins(): ContractPlugin[] {
  const registry = PluginRegistry.getInstance();
  const out = new Map<string, ContractPlugin>();

  for (const p of registry.list()) {
    const rec = registry.get(p.id);
    out.set(p.id, {
      id: p.id,
      kind: kindFor(rec?.manifest?.trust ?? (p as any).trust),
      code: null,
    });
  }

  try {
    const rows = db
      .query("SELECT plugin_id, source_code FROM plugin_files")
      .all() as Array<{ plugin_id: string; source_code: string | null }>;
    for (const row of rows) {
      const existing = out.get(row.plugin_id);
      if (existing) {
        if (row.source_code) existing.code = row.source_code;
      } else {
        out.set(row.plugin_id, { id: row.plugin_id, kind: "workspace", code: row.source_code });
      }
    }
  } catch {
    // Table may not exist in very old flows; registry coverage remains.
  }

  try {
    for (const entry of listRegistryPlugins()) {
      if (!out.has(entry.id)) {
        out.set(entry.id, { id: entry.id, kind: "community", code: null });
      }
    }
  } catch {
    // Community store unavailable; installed coverage remains.
  }

  return [...out.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/** Hard lifecycle violations for one plugin (empty = compliant). */
export function checkPluginLifecycle(plugin: ContractPlugin): string[] {
  if (!plugin.code) return [];
  return findLifecycleViolations(plugin.code);
}
