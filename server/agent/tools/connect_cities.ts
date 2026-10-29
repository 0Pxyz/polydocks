import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import type { AgentTool } from "./types";
import { addWorldLink } from "../../workspace/worldLinks";

export interface ConnectCitiesArgs {
  fromCityId: string;
  toCityId: string;
  reason?: string;
}

const slugPattern = /^[a-z0-9][a-z0-9_-]*$/;

export const connect_cities: AgentTool<ConnectCitiesArgs> = {
  name: "connect_cities",
  description:
    "Records a meaningful conceptual connection between two existing knowledge cities (e.g. Neural Networks <-> Statistics through probability and optimization). Both cities must already exist (use build_city first). Links render as conduits on the particle world map.",
  schema: z.object({
    fromCityId: z.string().min(1).describe("Origin city ID, e.g. 'neural-networks'"),
    toCityId: z.string().min(1).describe("Destination city ID, e.g. 'statistics'"),
    reason: z
      .string()
      .max(280)
      .optional()
      .describe("Short explanation of the conceptual relationship"),
  }),
  execute: async ({ fromCityId, toCityId, reason }) => {
    const from = fromCityId.trim();
    const to = toCityId.trim();

    // Verify both cities exist as workspace folders before linking.
    for (const id of [from, to]) {
      if (!slugPattern.test(id)) {
        return { success: false, error: `Invalid city ID "${id}".` };
      }
      try {
        const stat = await fs.stat(path.resolve(process.cwd(), "workspace", id));
        if (!stat.isDirectory()) {
          return { success: false, error: `City "${id}" does not exist. Use build_city to create it first.` };
        }
      } catch {
        return { success: false, error: `City "${id}" does not exist. Use build_city to create it first.` };
      }
    }

    const result = await addWorldLink({ from, to, reason });
    if (!result.success) {
      return { success: false, error: result.error };
    }
    return {
      success: true,
      action: "map.cities.connected",
      from,
      to,
      reason: result.link?.reason,
      message: `Connected "${from}" and "${to}"${result.link?.reason ? ` through ${result.link.reason}` : ""}.`,
    };
  },
};
