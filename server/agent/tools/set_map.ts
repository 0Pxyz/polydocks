import { z } from "zod";
import type { AgentTool } from "./types";
import { BUNDLED_MAPS } from "../../../src/features/world/bundledMaps";
import { db } from "../../workspace/db";

const setMapSchema = z.object({
  mapId: z.string().describe("ID of the target map style to switch to (e.g. gloom, ancient, atlas, monochrome)"),
});

export const set_map: AgentTool = {
  name: "set_map",
  description: "Switches the active map style. Use only for explicit restyle asks; never speculatively.",
  schema: setMapSchema,
  execute: async ({ mapId }) => {
    const targetId = mapId.toLowerCase().trim();

    // Verify map exists
    const bundled = BUNDLED_MAPS.find((m) => m.id === targetId);
    let mapName = bundled?.name;

    if (!bundled) {
      try {
        const row = db.query("SELECT name FROM maps WHERE id = ?").get(targetId) as any;
        if (row) {
          mapName = row.name;
        }
      } catch {
        // Table fallback
      }
    }

    if (!mapName) {
      return {
        error: `Map '${targetId}' not found. Available presets: ${BUNDLED_MAPS.map((m) => m.id).join(", ")}.`,
      };
    }

    return {
      action: "map.changed",
      mapId: targetId,
      name: mapName,
      message: `Active world map restyled to '${mapName}'.`,
    };
  },
};
