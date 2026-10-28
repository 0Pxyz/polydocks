import type { MapSource, CityPoint } from "./types";

export interface PlacementRequest {
  cityId: string;
  title?: string;
  regionHint?: string;
  near?: { x: number; y: number };
  x?: number;
  y?: number;
}

export type PlacementResult =
  | { status: "placed"; point: CityPoint }
  | { status: "needs_user_click"; cityId: string; title?: string }
  | { status: "error"; message: string };

/**
 * Deterministically places a city on a target map:
 * 1. Exact x,y wins if given.
 * 2. If map has sites:
 *    - Finds region matching regionHint (or first region).
 *    - Filters available sites in that region that don't already have a city.
 *    - If 'near' given, picks site with minimal Euclidean distance.
 *    - Otherwise picks site farthest from any existing city points.
 * 3. If map has no sites (imported raster):
 *    - Returns { status: 'needs_user_click' } for interactive click-to-place mode.
 */
export function placeCityOnMap(
  map: MapSource,
  existingPoints: CityPoint[],
  request: PlacementRequest
): PlacementResult {
  const { cityId, title, regionHint, near, x, y } = request;

  // 1. Exact coordinate override
  if (x !== undefined && y !== undefined) {
    const point: CityPoint = {
      id: `pt-${map.id}-${cityId}`,
      mapId: map.id,
      cityId,
      title,
      x: Math.min(Math.max(x, 0), 1),
      y: Math.min(Math.max(y, 0), 1),
      status: "discovered",
    };
    return { status: "placed", point };
  }

  // 2. Sites-based placement for structured maps
  const sites = map.sites || [];
  if (sites.length > 0) {
    const occupiedSiteNames = new Set(
      existingPoints.filter((p) => p.mapId === map.id).map((p) => `${p.x.toFixed(4)},${p.y.toFixed(4)}`)
    );

    // Find region candidates
    let candidateSites = sites;
    if (regionHint && map.regions && map.regions.length > 0) {
      const hintLower = regionHint.toLowerCase();
      const matchedRegion = map.regions.find(
        (r) => r.id.toLowerCase() === hintLower || r.name.toLowerCase().includes(hintLower)
      );
      if (matchedRegion) {
        const inRegion = sites.filter((s) => s.regionId === matchedRegion.id);
        if (inRegion.length > 0) {
          candidateSites = inRegion;
        }
      }
    }

    // Filter free sites
    const freeSites = candidateSites.filter(
      (s) => !occupiedSiteNames.has(`${s.x.toFixed(4)},${s.y.toFixed(4)}`)
    );

    const available = freeSites.length > 0 ? freeSites : sites; // Fall back to all sites if region is full
    if (available.length === 0) {
      return { status: "error", message: `No available sites found on map ${map.id}` };
    }

    let chosen = available[0];

    if (near) {
      // Pick site closest to `near`
      let bestDist = Infinity;
      for (const site of available) {
        const dist = Math.hypot(site.x - near.x, site.y - near.y);
        if (dist < bestDist) {
          bestDist = dist;
          chosen = site;
        }
      }
    } else if (existingPoints.length > 0) {
      // Pick site farthest from existing points for maximum visual clarity
      let maxMinDist = -1;
      for (const site of available) {
        let minDistToAny = Infinity;
        for (const ep of existingPoints) {
          const d = Math.hypot(site.x - ep.x, site.y - ep.y);
          if (d < minDistToAny) minDistToAny = d;
        }
        if (minDistToAny > maxMinDist) {
          maxMinDist = minDistToAny;
          chosen = site;
        }
      }
    }

    const point: CityPoint = {
      id: `pt-${map.id}-${cityId}`,
      mapId: map.id,
      cityId,
      title: title || chosen.name,
      x: chosen.x,
      y: chosen.y,
      status: "discovered",
    };

    return { status: "placed", point };
  }

  // 3. For maps without sites (e.g. imported raster maps without topology), require user click
  return {
    status: "needs_user_click",
    cityId,
    title,
  };
}

/**
 * Ensures all global cities have a corresponding CityPoint on the target map.
 */
export function syncCitiesToMap(
  targetMap: MapSource,
  currentPoints: CityPoint[],
  globalCities: Array<{ id: string; title: string; region?: string }>
): CityPoint[] {
  const resultPoints = [...currentPoints];
  const existingForMap = new Map<string, CityPoint>();

  for (const pt of currentPoints) {
    if (pt.mapId === targetMap.id) {
      existingForMap.set(pt.cityId, pt);
    }
  }

  for (const city of globalCities) {
    if (!existingForMap.has(city.id)) {
      const placement = placeCityOnMap(targetMap, resultPoints, {
        cityId: city.id,
        title: city.title,
        regionHint: city.region,
      });

      if (placement.status === "placed") {
        resultPoints.push(placement.point);
        existingForMap.set(city.id, placement.point);
      }
    }
  }

  return resultPoints;
}
