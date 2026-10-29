import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
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
    "Pins a city point on the map (writes map_points). Use after build_city in plan-build-place order; never before the workspace exists. Fails when the city does not exist. Only announce a placement from the returned point id, never from the request — and never cite coordinates as proof: the particle world renders from the city workspace, not from these numbers.",
  schema: placeCitySchema,
  execute: async ({ title, regionHint, near, x, y, mapId = "gloom" }) => {
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const cityId = `city-${slug}`;
    const targetMapId = mapId.toLowerCase();

    // Existence check first: a point for a city that was never built is a
    // lie the map cannot render. The city exists when it is registered in
    // the cities table or has a workspace folder (by id or title slug).
    // Never silently confirm a placement that nothing backs.
    let cityExists = false;
    try {
      const row = db
        .query("SELECT id FROM cities WHERE id = ?")
        .get(cityId) as { id: string } | null;
      cityExists = Boolean(row);
    } catch {
      cityExists = false;
    }
    if (!cityExists) {
      const workspaceRoot = path.resolve(process.cwd(), "workspace");
      for (const candidate of [cityId, slug]) {
        try {
          if (fs.statSync(path.join(workspaceRoot, candidate)).isDirectory()) {
            cityExists = true;
            break;
          }
        } catch {
          // Candidate folder absent; try the next one.
        }
      }
    }
    if (!cityExists) {
      return {
        error: `Cannot place "${title}": no city workspace or registration found for "${cityId}". Build it first with build_city.`,
        retryable: true,
        hint: "Run build_city for this topic, then call place_city again with the same title.",
        cityId,
      };
    }

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

    // 4. Persist to SQLite with UNIQUE constraint, then re-read: the
    // post-condition proves the point is really there. A write the tool
    // cannot read back is reported as a failure, never announced.
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
      return {
        error: `Failed to persist point for "${title}": ${err instanceof Error ? err.message : String(err)}`,
        retryable: true,
        cityId,
      };
    }

    let stored: any = null;
    try {
      stored = db
        .query("SELECT id, map_id, city_id, title, x, y, status FROM map_points WHERE id = ?")
        .get(point.id);
    } catch {
      stored = null;
    }
    if (!stored) {
      return {
        error: `Point for "${title}" was written but could not be read back. Not placed.`,
        retryable: true,
        cityId,
      };
    }

    return {
      action: "map.point.added",
      pointId: stored.id,
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
