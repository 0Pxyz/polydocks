import { BUNDLED_MAPS } from "./bundledMaps";

export interface LandCentroid {
  cx: number;
  cy: number;
  radius: number;
}

/**
 * Checks whether normalized coordinate (nx, ny) is on land.
 * Uses land centroid topology with safe radius bounds.
 */
export function isPointOnLand(mapId: string, nx: number, ny: number): boolean {
  const map = BUNDLED_MAPS.find((m) => m.id === mapId);
  if (!map || !map.regions || map.regions.length === 0) {
    // If no regions defined, permit placement
    return true;
  }

  // Check distance to any region land centroid or site
  const isNearRegion = map.regions.some((r) => {
    const dist = Math.hypot(nx - r.cx, ny - r.cy);
    return dist <= 0.22; // ~22% normalized radius around continental centroids
  });

  if (isNearRegion) return true;

  if (map.sites && map.sites.length > 0) {
    const isNearSite = map.sites.some((s) => {
      const dist = Math.hypot(nx - s.x, ny - s.y);
      return dist <= 0.12;
    });
    if (isNearSite) return true;
  }

  return false;
}
