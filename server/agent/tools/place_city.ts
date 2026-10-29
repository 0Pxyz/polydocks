import { z } from "zod";
import type { AgentTool } from "./types";
import { BUNDLED_MAPS } from "../../../src/features/world/bundledMaps";
import { placeCityOnMap } from "../../../src/features/world/placement";
import { db } from "../../workspace/db";
import type { CityPoint } from "../../../src/features/world/types";

const placeCitySchema = z.object({
  title: z.string().describe("Human-readable title of the city, discipline, or topic to place"),
  regionHint: z.string().optional().describe("Optional discipline or region name to place the city in"),
  near: z
    .object({
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
    })
    .optional()
    .describe("Normalized coordinates of a related city to cluster near"),
  x: z.number().min(0).max(1).optional().describe("Exact normalized X coordinate (0 to 1)"),
  y: z.number().min(0).max(1).optional().describe("Exact normalized Y coordinate (0 to 1)"),
  mapId: z.string().optional().default("gloom").describe("Target map ID (defaults to active map)"),
});

export const place_city: AgentTool = {
  name: "place_city",
  description:
    "Pins a city point on the map (writes map_points). Use after build_city in plan-build-place order; never before the workspace exists.",
  schema: placeCitySchema,
  execute: async ({ title, regionHint, near, x, y, mapId = "gloom" }) => {
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const cityId = `city-${slug}`;
    const targetMapId = mapId.toLowerCase();

    // 1. Locate target map
    const map = BUNDLED_MAPS.find((m) => m.id === targetMapId) || BUNDLED_MAPS[0];

    // 2. Fetch existing points from database
    let existingPoints: CityPoint[] = [];
    try {
      const rows = db.query("SELECT id, map_id, city_id, title, x, y, status FROM map_points WHERE map_id = ?").all(targetMapId) as any[];
      if (rows && rows.length > 0) {
        existingPoints = rows.map((r) => ({
          id: r.id,
          mapId: r.map_id,
          cityId: r.city_id,
          title: r.title,
          x: r.x,
          y: r.y,
          status: r.status,
        }));
      }
    } catch {
      // Table fallback
    }

    // 3. Compute deterministic placement
    const placement = placeCityOnMap(map, existingPoints, {
      cityId,
      title,
      regionHint,
      near,
      x,
      y,
    });

    if (placement.status === "needs_user_click") {
      return {
        action: "map.needs_placement",
        cityId,
        title,
        message: "This map has no predefined sites. Please click on land to place the city.",
      };
    }

    if (placement.status === "error") {
      return {
        error: placement.message,
      };
    }

    const { point } = placement;

    // 4. Persist to SQLite with UNIQUE constraint
    try {
      db.query(`
        INSERT INTO map_points (id, map_id, city_id, title, x, y, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(map_id, city_id) DO UPDATE SET
          x = excluded.x,
          y = excluded.y,
          title = excluded.title,
          status = excluded.status
      `).run(
        point.id,
        point.mapId,
        point.cityId,
        point.title || title,
        point.x,
        point.y,
        point.status,
        new Date().toISOString()
      );
    } catch (err) {
      console.warn("[place_city] SQLite persistence warning:", err);
    }

    return {
      action: "map.point.added",
      cityId: point.cityId,
      title: point.title || title,
      x: point.x,
      y: point.y,
      status: point.status,
      mapId: point.mapId,
      message: `Placed '${point.title || title}' at (${point.x.toFixed(3)}, ${point.y.toFixed(3)}) on map '${map.name}'.`,
    };
  },
};
