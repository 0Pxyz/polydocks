import { z } from "zod";
import type { AgentTool } from "./types";
import { capabilityBus } from "../../plugins/bus";

const FindCapabilitiesSchema = z.object({
  query: z
    .string()
    .describe("Keywords or terms to find relevant plugin capabilities"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(20)
    .default(5)
    .describe("Maximum number of capabilities to return"),
});

type FindCapabilitiesInput = z.infer<typeof FindCapabilitiesSchema>;

export const find_capabilities: AgentTool<typeof FindCapabilitiesSchema> = {
  name: "find_capabilities",
  description:
    "Searches enabled plugin capabilities by keyword scoring. Use before any invoke; do not guess capability ids.",
  schema: FindCapabilitiesSchema,
  execute: async (input: FindCapabilitiesInput) => {
    const rawTerms = input.query
      .toLowerCase()
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 1);

    const capabilities = capabilityBus.getCapabilities({ enabledOnly: true });

    const scored = capabilities.map((cap) => {
      let score = 0;
      const idLower = cap.id.toLowerCase();
      const titleLower = cap.title.toLowerCase();
      const descLower = cap.description.toLowerCase();
      const pluginLower = cap.pluginId.toLowerCase();

      for (const term of rawTerms) {
        if (idLower.includes(term)) score += 5;
        if (titleLower.includes(term)) score += 4;
        if (pluginLower.includes(term)) score += 3;
        if (descLower.includes(term)) score += 2;
      }

      return {
        id: cap.id,
        pluginId: cap.pluginId,
        title: cap.title,
        description: cap.description,
        risk: cap.risk,
        inputSchema: cap.inputSchema,
        score,
      };
    });

    const matches = scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, input.limit || 5)
      .map((item) => ({
        id: item.id,
        pluginId: item.pluginId,
        title: item.title,
        description: item.description,
        risk: item.risk,
        inputSchema: item.inputSchema,
      }));

    return {
      query: input.query,
      found: matches.length,
      capabilities: matches,
    };
  },
};
