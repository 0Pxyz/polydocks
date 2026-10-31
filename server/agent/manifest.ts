import type { Permission, PluginManifest } from "../plugins/manifest";

/**
 * The agent as a first-party plugin (#207).
 *
 * The agent operates the dock and workspace through the same tool
 * registry as every plugin, but its direct filesystem tools
 * (`write_file`, `read_file`, …) historically bypassed the capability
 * bus and its policy entirely — only capability-backed tools were gated.
 * This manifest closes that gap: the agent declares explicit permissions,
 * and the loop checks every tool call against them before executing.
 *
 * Enforcement layers, in order:
 * 1. Intent denylists filter the offered set (loop.ts).
 * 2. This manifest gates direct tools (fs family) — revoking a
 *    permission blocks the corresponding action, fail-closed.
 * 3. Capability-backed tools are additionally gated by the bus policy
 *    against their own plugin's manifest (unchanged).
 * 4. Plugin lifecycle writes additionally pass the install policy
 *    (ask-by-default, unchanged).
 */
export const AGENT_MANIFEST: PluginManifest = {
  apiVersion: 1,
  id: "agent",
  name: "Polymax Agent",
  version: "1.0.0",
  description:
    "The privileged first-party operator: runs the agent loop over the shared tool registry under explicit permissions.",
  icon: "bot",
  trust: "first-party",
  capabilities: [],
  permissions: [
    { type: "fs", scope: "workspace", mode: "read" },
    { type: "fs", scope: "workspace", mode: "write" },
  ],
};

/**
 * Direct permission requirement per tool, for tools whose `execute`
 * touches the filesystem without passing through the capability bus.
 * Tools backed by the bus (search, sandbox, browser, plugin lifecycle,
 * facade paths) carry no agent-level requirement: their own plugin
 * manifest governs them at invoke time.
 */
export const AGENT_TOOL_REQUIREMENTS: Record<string, Permission> = {
  list_files: { type: "fs", scope: "workspace", mode: "read" },
  read_file: { type: "fs", scope: "workspace", mode: "read" },
  search_files: { type: "fs", scope: "workspace", mode: "read" },
  recall_memory: { type: "fs", scope: "workspace", mode: "read" },
  write_file: { type: "fs", scope: "workspace", mode: "write" },
  edit_file: { type: "fs", scope: "workspace", mode: "write" },
  record_memory: { type: "fs", scope: "workspace", mode: "write" },
  // Image cache writes under DATA_DIR (app-data family, fs-gated).
  generate_image: { type: "fs", scope: "workspace", mode: "write" },
};

export interface AgentPolicyCheck {
  allowed: boolean;
  reason?: string;
}

function fsCovers(granted: Permission, required: Permission): boolean {
  if (granted.type !== "fs" || required.type !== "fs") return false;
  if (granted.scope !== required.scope) return false;
  if (granted.mode === required.mode) return true;
  // A write grant covers reads within the same scope.
  return granted.mode === "write" && required.mode === "read";
}

/**
 * Fail-closed permission check of one tool call against an agent
 * manifest. Tools without a direct requirement are allowed (their
 * bus/facade/install-policy gates still apply downstream).
 */
export function checkAgentPermission(
  toolName: string,
  manifest: PluginManifest = AGENT_MANIFEST
): AgentPolicyCheck {
  const required = AGENT_TOOL_REQUIREMENTS[toolName];
  if (!required) return { allowed: true };
  const granted = (manifest.permissions ?? []).some((p) => {
    if (p.type !== required.type) return false;
    if (p.type === "fs" && required.type === "fs") return fsCovers(p, required);
    return true;
  });
  if (granted) return { allowed: true };
  return {
    allowed: false,
    reason:
      `Policy violation: agent manifest "${manifest.id}" does not grant ` +
      `"${required.type}" for tool "${toolName}". Revoked permission blocks this action.`,
  };
}
