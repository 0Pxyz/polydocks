import { pluginRegistry, type InstalledPluginRecord } from "./registry";
import { approvalManager, type ApprovalDecision } from "./approval";
import type { RegisteredCapability } from "./bus";

export interface PolicyEvaluationResult {
  allowed: boolean;
  reason?: string;
  decision?: ApprovalDecision;
}

/**
 * Evaluates the security policy for a capability execution request.
 * Enforces default-deny for undeclared permissions, automatic grants for core/first-party,
 * and user approval prompts for destructive and external operations.
 */
export async function evaluateCapabilityPolicy(params: {
  capability: RegisteredCapability;
  plugin: InstalledPluginRecord;
  actor: "agent" | "user";
  cityId?: string;
  input?: Record<string, unknown>;
  timeoutMs?: number;
  emit?: (event: { type: string; payload: Record<string, unknown> }) => Promise<void> | void;
}): Promise<PolicyEvaluationResult> {
  const { capability, plugin, actor, cityId, input, timeoutMs, emit } = params;
  const manifest = plugin.manifest;

  // 1. Default-deny: Verify undeclared permissions for adapters
  if (capability.adapter?.http) {
    const hasNet = manifest.permissions?.some((p) => p.type === "net");
    if (!hasNet && manifest.trust !== "core") {
      return {
        allowed: false,
        reason: `Policy violation: Capability "${capability.id}" requires network access, but plugin "${plugin.id}" has no declared "net" permission.`,
      };
    }
  }

  if (capability.adapter?.cli) {
    const hasExec = manifest.permissions?.some((p) => p.type === "exec");
    if (!hasExec && manifest.trust !== "core") {
      return {
        allowed: false,
        reason: `Policy violation: Capability "${capability.id}" requires execution access, but plugin "${plugin.id}" has no declared "exec" permission.`,
      };
    }
  }

  if (capability.adapter?.mcp) {
    const hasMcp = manifest.permissions?.some((p) => p.type === "mcp");
    if (!hasMcp && manifest.trust !== "core") {
      return {
        allowed: false,
        reason: `Policy violation: Capability "${capability.id}" requires MCP access, but plugin "${plugin.id}" has no declared "mcp" permission.`,
      };
    }
  }

  const risk = capability.risk;
  const scope = cityId ? `city:${cityId}` : `plugin:${plugin.id}`;

  // 2. Destructive actions: ALWAYS prompt user confirmation and halt on timeout/rejection
  if (risk === "destructive") {
    // If user explicitly initiated directly as actor === "user", still prompt or verify confirmation
    const decision = await approvalManager.requestApproval({
      pluginId: plugin.id,
      capabilityId: capability.id,
      risk: "destructive",
      scope,
      summary: `Destructive action "${capability.title}" requested by ${actor}. Confirm execution?`,
      input,
      timeoutMs: timeoutMs ?? 15_000,
      emit,
    });

    if (decision === "denied") {
      return {
        allowed: false,
        reason: `Execution halted: Destructive action "${capability.id}" was rejected or timed out.`,
        decision,
      };
    }

    return { allowed: true, decision };
  }

  // 3. External operations: Request user confirmation on first use
  if (risk === "external") {
    const hasGrant = pluginRegistry.hasGrant(plugin.id, "external", scope);
    if (!hasGrant && manifest.trust !== "core") {
      const decision = await approvalManager.requestApproval({
        pluginId: plugin.id,
        capabilityId: capability.id,
        risk: "external",
        scope,
        summary: `External network/service access requested by "${capability.title}" for plugin "${plugin.id}".`,
        input,
        timeoutMs: timeoutMs ?? 15_000,
        emit,
      });

      if (decision === "denied") {
        return {
          allowed: false,
          reason: `Execution halted: External operation "${capability.id}" was denied or timed out.`,
          decision,
        };
      }

      return { allowed: true, decision };
    }

    return { allowed: true };
  }

  // 4. Write operations
  if (risk === "write") {
    // Auto-allowed for first-party plugins within active city workspace
    if (manifest.trust === "core" || (manifest.trust === "first-party" && cityId)) {
      return { allowed: true };
    }

    // Otherwise check for existing grant or request approval
    const hasGrant = pluginRegistry.hasGrant(plugin.id, "write", scope);
    if (!hasGrant) {
      const decision = await approvalManager.requestApproval({
        pluginId: plugin.id,
        capabilityId: capability.id,
        risk: "write",
        scope,
        summary: `Write access requested by "${capability.title}" on scope "${scope}".`,
        input,
        timeoutMs: timeoutMs ?? 15_000,
        emit,
      });

      if (decision === "denied") {
        return {
          allowed: false,
          reason: `Execution halted: Write operation "${capability.id}" was denied or timed out.`,
          decision,
        };
      }

      return { allowed: true, decision };
    }

    return { allowed: true };
  }

  // 5. Read operations
  if (risk === "read") {
    // Auto-allowed for core and first-party plugins
    if (manifest.trust === "core" || manifest.trust === "first-party") {
      return { allowed: true };
    }

    // For generated or external plugins, verify grant or request approval
    const hasGrant = pluginRegistry.hasGrant(plugin.id, "read", scope);
    if (!hasGrant) {
      const decision = await approvalManager.requestApproval({
        pluginId: plugin.id,
        capabilityId: capability.id,
        risk: "read",
        scope,
        summary: `Read access requested by "${capability.title}" for plugin "${plugin.id}".`,
        input,
        timeoutMs: timeoutMs ?? 15_000,
        emit,
      });

      if (decision === "denied") {
        return {
          allowed: false,
          reason: `Execution halted: Read operation "${capability.id}" was denied or timed out.`,
          decision,
        };
      }

      return { allowed: true, decision };
    }

    return { allowed: true };
  }

  return { allowed: true };
}
