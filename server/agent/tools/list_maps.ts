import { z } from "zod";
import type { AgentTool } from "./types";
import { BUNDLED_MAPS } from "../../../src/features/world/bundledMaps";
import { db } from "../../workspace/db";

const listMapsSchema = z.object({});

export const list_maps: AgentTool = {
  name: "list_maps",
  description: "List all available world map styles and sources (bundled presets and imported maps).",
  schema: listMapsSchema,
  execute: async () => {
    // 1. Bundled maps
    const bundled = BUNDLED_MAPS.map((m) => ({
      id: m.id,
      name: m.name,
      style: m.style,
      kind: m.kind,
      regionsCount: m.regions?.length || 0,
      sitesCount: m.sites?.length || 0,
    }));

    // 2. Imported maps from database
    let imported: Array<{ id: string; name: string; style: string; kind: string }> = [];
    try {
      const rows = db.query("SELECT id, name, style, kind FROM maps WHERE kind = 'imported'").all() as any[];
      if (rows && rows.length > 0) {
        imported = rows.map((r) => ({
          id: r.id,
          name: r.name,
          style: r.style,
          kind: r.kind,
        }));
      }
    } catch {
      // Database table might not be initialized yet
    }

    return {
      maps: [...bundled, ...imported],
      count: bundled.length + imported.length,
    };
  },
};
