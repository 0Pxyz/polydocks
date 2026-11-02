import { z } from "zod";
import { CapabilityBus } from "../../plugins/bus";
import type { AgentTool } from "./types";

/**
 * Derived tool catalog: every registered capability exposes one agent
 * tool with no edit to a catalog file. Generated tools delegate to the
 * capability bus (`invoke_capability` semantics) so policy, receipts and
 * audit apply identically.
 *
 * Static tools (dock verbs, plugin lifecycle, research, files, memory)
 * remain hand-written; this module merges them with the generated set.
 * Single source of truth for diffs: `generatedCatalogSnapshot()`.
 */

export function capabilityToolName(capabilityId: string): string {
  return `cap.${capabilityId}`;
}

function schemaFromInput(input: unknown): z.ZodType<any> {
  if (input && typeof input === "object" && (input as any).type === "object") {
    try {
      // Capability manifests carry JSON-schema-ish inputs; accept
      // passthrough objects so the bus validates strictly at invoke time.
      return z.object({}).passthrough();
    } catch {
      return z.object({}).passthrough();
    }
  }
  return z.object({}).passthrough();
}

export function buildDynamicCapabilityTools(): AgentTool[] {
  const bus = CapabilityBus.getInstance();
  // Only capabilities of active (enabled) plugins are exposed (#153):
  // deactivating a plugin hides its tools from the agent; reactivating
  // brings them back. Handler-registered capabilities without a plugin
  // record are unaffected (no record to be disabled).
  const caps = bus.getCapabilities({ enabledOnly: true });
  return caps.map((cap) => ({
    name: capabilityToolName(cap.id),
    description: `${cap.title}: ${cap.description} (capability ${cap.id} from ${cap.pluginId})`,
    schema: schemaFromInput(cap.inputSchema),
    execute: async (args: any, ctx: any) => {
      const res = await bus.invoke(cap.id, args ?? {}, {
        actor: ctx?.actor === "cli" || ctx?.actor === "user" ? "user" : "agent",
        workspaceId: ctx?.workspaceId,
        step: ctx?.step,
      });
      return res;
    },
  }));
}

/** Names of the static catalog (for diff tests). */
export function generatedCatalogSnapshot(staticNames: string[]): { static: string[]; dynamic: string[] } {
  return {
    static: [...staticNames].sort(),
    dynamic: buildDynamicCapabilityTools().map((t) => t.name).sort(),
  };
}
