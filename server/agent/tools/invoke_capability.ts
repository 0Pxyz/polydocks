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
    "Invokes an authorized plugin capability by its unique ID through the typed capability bus.",
  schema: InvokeCapabilitySchema,
  execute: async (input: InvokeCapabilityInput, context) => {
    const result = await capabilityBus.invoke(input.id, input.input, {
      actor: "agent",
      cityId: context.cityId,
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
