import { config } from "../config";

/**
 * Background approval request (#315). Interactive turns keep the fail-closed
 * approval_required text (the model asks in chat); a background task has no
 * reader, so ask-mode escalates to a real approval request with a long
 * window instead of failing the job silently. Returns true when the user
 * allowed and the caller may proceed. No task context = no request (false).
 */
export async function requestTaskApproval(
  ctx:
    | {
        taskId?: string;
        step?: number;
        onEvent?: (event: { step: number; type: string; payload: Record<string, unknown> }) => Promise<void> | void;
        emit?: (event: { type: string; payload: Record<string, unknown> }) => Promise<void> | void;
      }
    | undefined,
  opts: { pluginId: string; capabilityId: string; scope: string; summary: string }
): Promise<boolean> {
  const emit = ctx?.onEvent ?? ctx?.emit;
  if (!ctx?.taskId || !emit) return false;
  const step = ctx.step ?? 1;
  const { approvalManager } = await import("../plugins/approval");
  const decision = await approvalManager.requestApproval({
    pluginId: opts.pluginId,
    capabilityId: opts.capabilityId,
    risk: "write",
    scope: opts.scope,
    summary: opts.summary,
    // Background jobs outlive the 15s interactive window: the card stays
    // until the job timeout approaches (default job budget is 30 min).
    timeoutMs: 10 * 60 * 1000,
    emit: async (evt) => {
      await emit({ step, type: evt.type, payload: evt.payload });
    },
  });
  return decision === "allow_once" || decision === "allow_always";
}

/**
 * Install policy gate (INSTALL_POLICY, default "ask").
 * Any plugin-lifecycle write with actor=agent (create/modify/publish/
 * install, MCP connect) must pass here regardless of the surface
 * (verb tool, full tool, route, CLI) that invoked it:
 * Any plugin-lifecycle write with actor=agent (create/modify/publish/
 * install, MCP connect) must pass here regardless of the surface
 * (verb tool, full tool, route, CLI) that invoked it:
 * - never: always deny.
 * - ask: require explicit user approval ({ userApproved: true } or an
 *   explicit human action: actor user/cli).
 * - auto: proceed.
 * Returns null when the write may proceed, otherwise a failure envelope.
 */
export function enforceInstallPolicy(
  actor: string | undefined,
  userApproved?: unknown
): { ok: false; error: string; retryable: false; code: "install_denied" | "approval_required" } | null {
  const act = actor || "user";
  if (config.INSTALL_POLICY === "never") {
    return {
      ok: false,
      error: "Install policy is 'never': this write is disabled.",
      retryable: false,
      code: "install_denied",
    };
  }
  if (config.INSTALL_POLICY !== "auto" && act === "agent" && userApproved !== true) {
    return {
      ok: false,
      error: "Install policy is 'ask': confirm with the user first, then retry with { userApproved: true }.",
      retryable: false,
      code: "approval_required",
    };
  }
  return null;
}
