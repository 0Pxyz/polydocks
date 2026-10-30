import { z } from "zod";
import type { AgentTool } from "./types";
import { capabilityBus } from "../../plugins/bus";

const InvokeCapabilitySchema = z.object({
  id: z.string().describe("The capability identifier to invoke (e.g. search.web)"),
  input: z
    .record(z.string(), z.any())
    .default({})
    .describe("Input arguments conforming to the capability input schema"),
});

type InvokeCapabilityInput = z.infer<typeof InvokeCapabilitySchema>;

export const invoke_capability: AgentTool<typeof InvokeCapabilitySchema> = {
  name: "invoke_capability",
  description:
    "Runs one authorized capability by id through policy and audit. Use for actions with existing capabilities; do not use to build tools or fetch the open web.",
  schema: InvokeCapabilitySchema,
  execute: async (input: InvokeCapabilityInput, context) => {
    // Scope follows the explicitly targeted city: a global-chat turn can
    // still act inside a city when the capability input names it. Without
    // this, city-scoped grants never match and every city write from the
    // general chat stalls in approval.
    const rawInput = (input.input ?? {}) as Record<string, unknown>;
    const targetCity =
      (typeof rawInput.cityId === "string" && rawInput.cityId) || context.cityId;
    const result = await capabilityBus.invoke(input.id, input.input, {
      actor: "agent",
      cityId: targetCity,
      step: context.step,
    });

    if (!result.success) {
      return {
        error: result.error || `Execution failed for capability "${input.id}"`,
        capabilityId: input.id,
        durationMs: result.durationMs,
      };
    }

    return {
      success: true,
      capabilityId: input.id,
      pluginId: result.pluginId,
      data: result.data,
      durationMs: result.durationMs,
    };
  },
};
