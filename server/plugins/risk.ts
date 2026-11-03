import type { CapabilityRisk, Permission } from "./manifest";
import type { RegisteredCapability } from "./bus";

/**
 * Stated risk ladder (#180). The mapping lives here, in one place;
 * enforcement lives in the bus/policy path (`evaluateCapabilityPolicy`),
 * never per tool. Low-risk items stay quiet (no new prompts on
 * previously silent safe paths); only genuinely risky actions escalate.
 *
 * - read: inspect state, list, open views. Auto for core/first-party;
 *   one-time grant otherwise.
 * - write: persist inside the plugin's own storage/workspace. Auto for
 *   core and for first-party inside an active workspace; grant otherwise.
 * - external: reach outside (network, MCP, secrets). One-time grant or
 *   explicit approval, even for first-party (trust does not imply a
 *   standing network pass).
 * - destructive: delete, publish publicly, terminate. Always prompts,
 *   every time, for every trust level.
 */
export const RISK_LADDER: Array<{
  tier: CapabilityRisk;
  treatment: string;
  prompts: "never" | "first-use" | "always";
}> = [
  { tier: "read", treatment: "Auto for core/first-party; one-time grant otherwise.", prompts: "first-use" },
  { tier: "write", treatment: "Auto for core and first-party in an active workspace; grant otherwise.", prompts: "first-use" },
  { tier: "external", treatment: "Explicit approval on first use, even for first-party.", prompts: "first-use" },
  { tier: "destructive", treatment: "Always prompts, every time, for every trust level.", prompts: "always" },
];

export interface RiskTier {
  tier: CapabilityRisk;
  prompts: "never" | "first-use" | "always";
  /** Human-readable what + why for install-time display. */
  summary: string;
}

/** Resolve any registered capability to its ladder tier. */
export function tierForCapability(cap: Pick<RegisteredCapability, "id" | "title" | "risk">): RiskTier {
  const entry = RISK_LADDER.find((l) => l.tier === cap.risk) ?? RISK_LADDER[0];
  return {
    tier: entry.tier,
    prompts: entry.prompts,
    summary: `${cap.title}: ${entry.treatment}`,
  };
}

/** Human-readable permission line for install-time display (what + why). */
export function describePermission(p: Permission): string {
  switch (p.type) {
    case "net":
      return `Network access to ${(p.hosts ?? []).join(", ") || "declared hosts"} — the plugin fetches remote data.`;
    case "fs":
      return `File ${p.mode} in ${p.scope} storage — the plugin keeps its own data.`;
    case "exec":
      return `Run commands (${(p.commands ?? []).join(", ") || "declared commands"}) — sandboxed execution.`;
    case "mcp":
      return `Connect the "${p.server}" MCP server — third-party tools run through it.`;
    case "secret":
      return `Read the "${p.name}" credential — approval required.`;
    default:
      return `Declared permission (unknown type).`;
  }
}

/**
 * Install-time quiet set (#180): own state, own UI, workspace-scoped
 * storage. Everything else (network, exec, MCP, secrets, writes outside
 * the plugin's own storage) needs an explicit acknowledge at install.
 * This is the UI threshold only — enforcement stays in policy.ts.
 */
export function isQuietPermission(p: Permission): boolean {
  if (p.type === "fs") return p.scope === "plugin" || p.mode === "read";
  return false;
}

/** True when installing requires the user to acknowledge permissions. */
export function requiresInstallAcknowledge(permissions: Permission[]): boolean {
  return permissions.some((p) => !isQuietPermission(p));
}
