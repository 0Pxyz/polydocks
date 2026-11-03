import { z } from "zod";
import type { AgentTool } from "./types";
import { capabilityBus } from "../../plugins/bus";
import { PluginRegistry } from "../../plugins/registry";

export interface OperatePluginArgs {
  pluginId: string;
  action: string;
  args?: Record<string, unknown>;
  workspaceId?: string;
}

export const operate_plugin: AgentTool<OperatePluginArgs> = {
  name: "operate_plugin",
  description:
    "Runs a plugin's declared action. Use for operating installed plugins; undeclared actions fail listing what exists, so check first.",
  schema: z.object({
    pluginId: z.string().describe("ID of the installed plugin to operate"),
    action: z.string().describe("Action or capability to execute (e.g. 'start', 'reset', 'export')"),
    args: z
      .record(z.string(), z.unknown())
      .optional()
      .default({})
      .describe("Arguments to pass to the plugin action"),
    workspaceId: z.string().optional().describe("Workspace where plugin is executing"),
  }),
  execute: async (input, ctx) => {
    const registry = PluginRegistry.getInstance();
    const plugin = registry.get(input.pluginId);

    const capabilityId = input.action.includes(".")
      ? input.action
      : `${input.pluginId}.${input.action}`;

    const hasCap = Boolean(capabilityBus.getCapability(capabilityId));
    if (!hasCap) {
      // If capability isn't strictly registered in bus, check plugin capabilities
      const declared = plugin?.manifest.capabilities.find(
        (c) => c.id === capabilityId || c.id === input.action
      );

      if (!declared) {
        return {
          success: false,
          error: `Action "${input.action}" is not exposed by plugin "${input.pluginId}". Available capabilities: ${
            plugin?.manifest.capabilities.map((c) => c.id).join(", ") || "none"
          }`,
        };
      }
    }

    const execResult = await capabilityBus.invoke(capabilityId, input.args || {}, {
      actor: "agent",
      workspaceId: input.workspaceId || ctx?.workspaceId || "default",
      step: ctx?.step,
      taskId: ctx?.taskId,
      onEvent: ctx?.onEvent,
    });

    if (!execResult.success) {
      return {
        success: false,
        error: execResult.error || `Execution failed for plugin action "${capabilityId}"`,
        capabilityId,
        pluginId: input.pluginId,
      };
    }

    return {
      success: true,
      pluginId: input.pluginId,
      action: input.action,
      capabilityId,
      data: execResult.data,
      durationMs: execResult.durationMs,
    };
  },
};
