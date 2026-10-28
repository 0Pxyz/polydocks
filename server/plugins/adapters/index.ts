import type { CapabilityHandler } from "../bus";
import type { CapabilityManifest } from "../manifest";
import { executeHttpAdapter } from "./http";
import { executeCliAdapter } from "./cli";
import { executeMcpAdapter } from "./mcp";

export * from "./types";
export * from "./http";
export * from "./cli";
export * from "./mcp";

/**
 * Resolves a capability adapter configuration into an executable CapabilityHandler.
 */
export function resolveAdapterHandler(
  adapter?: CapabilityManifest["adapter"]
): CapabilityHandler | undefined {
  if (!adapter) {
    return undefined;
  }

  if (adapter.http) {
    return async (input, ctx) => executeHttpAdapter(adapter.http, input, ctx);
  }

  if (adapter.cli) {
    return async (input, ctx) => executeCliAdapter(adapter.cli, input, ctx);
  }

  if (adapter.mcp) {
    return async (input, ctx) => executeMcpAdapter(adapter.mcp, input, ctx);
  }

  return undefined;
}
