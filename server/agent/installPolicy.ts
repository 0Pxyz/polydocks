import { config } from "../config";

/**
 * Install policy gate (INSTALL_POLICY, default "ask").
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
