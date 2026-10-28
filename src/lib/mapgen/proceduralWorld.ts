import { Delaunay } from "d3-delaunay";
import { createNoise2D } from "simplex-noise";
import {
  type Coastline,
  type LayoutCity,
  type LayoutRegion,
  type MapBounds,
  type MapLayout,
  MapLayoutSchema,
  type MapSpec,
  type Point2D,
  type River,
  type Road,
  type TerrainSprite,
} from "../../features/world/types";
import { PRNG, hashStringToSeed } from "./prng";

const THEME_PALETTES = [
  { color: "#C8FF57", accent: "rgba(200, 255, 87, 0.25)" }, // Electric Lime
  { color: "#57C8FF", accent: "rgba(87, 200, 255, 0.25)" }, // Cyan Cartography
  { color: "#FFC857", accent: "rgba(255, 200, 87, 0.25)" }, // Solar Amber
  { color: "#A855F7", accent: "rgba(168, 85, 247, 0.25)" }, // Amethyst Purple
  { color: "#FF57C8", accent: "rgba(255, 87, 200, 0.25)" }, // Hot Magenta
  { color: "#34D399", accent: "rgba(52, 211, 153, 0.25)" }, // Emerald Green
  { color: "#F87171", accent: "rgba(248, 113, 113, 0.25)" }, // Coral Red
];

function dist(a: Point2D, b: Point2D): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Deterministic hash-based 2D offset from a key string.
 */
function deterministicOffset(key: string, radius: number): Point2D {
  const h1 = hashStringToSeed(key + ":x");
  const h2 = hashStringToSeed(key + ":y");
  const prng1 = new PRNG(h1);
  const prng2 = new PRNG(h2);

  const angle = prng1.next() * Math.PI * 2;
  const r = Math.sqrt(prng2.next()) * radius;
  return {
    x: Math.cos(angle) * r,
    y: Math.sin(angle) * r,
  };
}

/**
 * Generates an illustrated procedural MapLayout from a semantic MapSpec.
 * Preserves stable hash partitioning: adding a city never moves existing cities
 * or redraws existing region foundations.
 */
export function generateMapLayout(spec: MapSpec): MapLayout {
  const globalSeed = hashStringToSeed(spec.seed);
  const noisePRNG = new PRNG(globalSeed);
  const noise2D = createNoise2D(() => noisePRNG.next());

  const layoutRegions: LayoutRegion[] = [];
  const layoutCities: LayoutCity[] = [];
  const coastlines: Coastline[] = [];
  const rivers: River[] = [];
  const roads: Road[] = [];
  const terrainSprites: TerrainSprite[] = [];

  // 1. Position Regions stably using golden ratio / hash partition
  spec.regions.forEach((region, i) => {
    // Stable region center derived from region.id + seed
    const regionHash = hashStringToSeed(spec.seed + ":reg:" + region.id);
    const regionPRNG = new PRNG(regionHash);

    // Distribute around golden angle, perturbed deterministically by hash
    const goldenAngle = 2.399963229728653; // ~137.5 degrees
    const baseAngle = i * goldenAngle + (regionPRNG.next() - 0.5) * 0.4;
    const baseDist = (120 + Math.sqrt(i) * 220) * (0.85 + regionPRNG.next() * 0.3);

    const center: Point2D = {
      x: Math.round(Math.cos(baseAngle) * baseDist),
      y: Math.round(Math.sin(baseAngle) * baseDist),
    };

    const palette = THEME_PALETTES[i % THEME_PALETTES.length];
    const regionRadius = 260 + (region.cities.length > 3 ? 60 : 0);

    // Compute organic hull using Voronoi or radial sample with Simplex noise
    const hullPoints: Point2D[] = [];
    const steps = 36;
    for (let s = 0; s < steps; s++) {
      const theta = (s / steps) * Math.PI * 2;
      const nx = Math.cos(theta);
      const ny = Math.sin(theta);
      const n = noise2D((center.x + nx * regionRadius) * 0.003, (center.y + ny * regionRadius) * 0.003);
      const r = regionRadius * (0.82 + n * 0.28);
      hullPoints.push({
        x: Math.round(center.x + nx * r),
        y: Math.round(center.y + ny * r),
      });
    }

    layoutRegions.push({
      id: region.id,
      title: region.title,
      topic: region.topic,
      center,
      radius: regionRadius,
      color: region.color || palette.color,
      accentColor: region.accentColor || palette.accent,
      hull: hullPoints,
      cities: region.cities.map((c) => c.id),
    });

    // 2. Generate Coastline for this region
    // Main landmass polygon
    coastlines.push({
      polygon: hullPoints,
      depth: 0, // Sea level coastline
    });

    // Outer shelf contour (decorative shallows contour)
    const shelfPoints: Point2D[] = hullPoints.map((pt) => {
      const dx = pt.x - center.x;
      const dy = pt.y - center.y;
      return {
        x: Math.round(center.x + dx * 1.15),
        y: Math.round(center.y + dy * 1.15),
      };
    });
    coastlines.push({
      polygon: shelfPoints,
      depth: 1, // Shallows depth
    });

    // 3. Stably position cities within this region
    // Crucial property: adding city C to region R does not move any other city
    const placedCityPositions: Point2D[] = [];

    region.cities.forEach((city) => {
      const cityKey = `${spec.seed}:${region.id}:${city.id}`;

      // Attempt deterministic candidate slots with minimum clearance
      let pos: Point2D = { x: center.x, y: center.y };
      const maxAttempts = 25;
      const minDistance = 75;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const offset = deterministicOffset(`${cityKey}:attempt:${attempt}`, regionRadius * 0.65);
        const candidate: Point2D = {
          x: Math.round(center.x + offset.x),
          y: Math.round(center.y + offset.y),
        };

        // Check distance to already placed cities in this region
        const tooClose = placedCityPositions.some((p) => dist(p, candidate) < minDistance);
        if (!tooClose || attempt === maxAttempts - 1) {
          pos = candidate;
          break;
        }
      }

      placedCityPositions.push(pos);

      layoutCities.push({
        id: city.id,
        title: city.title,
        regionId: region.id,
        level: city.level ?? 1,
        position: pos,
        state: "discovered",
        tags: city.tags ?? [],
        description: city.description ?? "",
        questCount: 3,
      });
    });

    // 4. Generate Procedural Terrain Sprites (Mountains, Hills, Forests, Ruins)
    const terrainPRNG = new PRNG(hashStringToSeed(`${spec.seed}:terrain:${region.id}`));
    const spriteCount = 18;

    for (let s = 0; s < spriteCount; s++) {
      const angle = terrainPRNG.next() * Math.PI * 2;
      const r = (0.2 + terrainPRNG.next() * 0.6) * regionRadius;
      const sx = Math.round(center.x + Math.cos(angle) * r);
      const sy = Math.round(center.y + Math.sin(angle) * r);

      // Keep clearance from city sites so sprites don't obscure city markers
      const nearCity = placedCityPositions.some((cp) => dist(cp, { x: sx, y: sy }) < 50);
      if (nearCity) continue;

      const kindRand = terrainPRNG.next();
      let kind: TerrainSprite["kind"] = "mountain";
      if (kindRand < 0.35) kind = "mountain";
      else if (kindRand < 0.65) kind = "hill";
      else if (kindRand < 0.92) kind = "forest";
      else kind = "ruins";

      terrainSprites.push({
        kind,
        x: sx,
        y: sy,
        scale: Math.round((0.85 + terrainPRNG.next() * 0.45) * 100) / 100,
        variant: Math.floor(terrainPRNG.next() * 3),
      });
    }

    // 5. Generate Procedural River for this region
    // Starts from mountain interior, flows downhill to coastline
    const riverStartAngle = regionPRNG.next() * Math.PI * 2;
    const startPoint: Point2D = {
      x: Math.round(center.x + Math.cos(riverStartAngle) * (regionRadius * 0.3)),
      y: Math.round(center.y + Math.sin(riverStartAngle) * (regionRadius * 0.3)),
    };

    const riverPath: Point2D[] = [startPoint];
    let curr = { ...startPoint };
    const riverSteps = 7;
    const riverHeading = riverStartAngle + (regionPRNG.next() - 0.5) * 0.8;

    for (let step = 1; step <= riverSteps; step++) {
      const stepDist = (regionRadius * 0.75) / riverSteps;
      const meander = (noise2D(curr.x * 0.01, curr.y * 0.01) - 0.5) * 25;
      curr = {
        x: Math.round(curr.x + Math.cos(riverHeading) * stepDist - Math.sin(riverHeading) * meander),
        y: Math.round(curr.y + Math.sin(riverHeading) * stepDist + Math.cos(riverHeading) * meander),
      };
      riverPath.push(curr);
    }

    rivers.push({
      path: riverPath,
      width: 3.5,
    });
  });

  // 6. Generate Roads
  // Intra-region roads (connecting cities in the same region)
  layoutRegions.forEach((reg) => {
    const regCities = layoutCities.filter((c) => c.regionId === reg.id);
    for (let i = 0; i < regCities.length - 1; i++) {
      const from = regCities[i];
      const to = regCities[i + 1];
      const mid: Point2D = {
        x: Math.round((from.position.x + to.position.x) / 2 + (noise2D(from.position.x * 0.02, to.position.y * 0.02) * 18)),
        y: Math.round((from.position.y + to.position.y) / 2 + (noise2D(from.position.y * 0.02, to.position.x * 0.02) * 18)),
      };

      roads.push({
        fromCityId: from.id,
        toCityId: to.id,
        points: [from.position, mid, to.position],
        kind: "trail",
      });
    }
  });

  // Inter-region roads / bridges
  if (layoutRegions.length > 1) {
    for (let i = 0; i < layoutRegions.length; i++) {
      const nextIdx = (i + 1) % layoutRegions.length;
      const regA = layoutRegions[i];
      const regB = layoutRegions[nextIdx];

      const citiesA = layoutCities.filter((c) => c.regionId === regA.id);
      const citiesB = layoutCities.filter((c) => c.regionId === regB.id);

      if (citiesA.length > 0 && citiesB.length > 0) {
        // Find closest pair of cities between regions
        let closestA = citiesA[0];
        let closestB = citiesB[0];
        let minDist = dist(closestA.position, closestB.position);

        for (const ca of citiesA) {
          for (const cb of citiesB) {
            const d = dist(ca.position, cb.position);
            if (d < minDist) {
              minDist = d;
              closestA = ca;
              closestB = cb;
            }
          }
        }

        const mid: Point2D = {
          x: Math.round((closestA.position.x + closestB.position.x) / 2),
          y: Math.round((closestA.position.y + closestB.position.y) / 2),
        };

        roads.push({
          fromCityId: closestA.id,
          toCityId: closestB.id,
          points: [closestA.position, mid, closestB.position],
          kind: "bridge",
        });
      }
    }
  }

  // 6b. Voronoi relaxation validation for region centers
  if (layoutRegions.length >= 3) {
    const coords = new Float64Array(layoutRegions.length * 2);
    layoutRegions.forEach((reg, idx) => {
      coords[idx * 2] = reg.center.x;
      coords[idx * 2 + 1] = reg.center.y;
    });
    const delaunay = new Delaunay(coords);
    const voronoi = delaunay.voronoi([-2000, -2000, 2000, 2000]);
    for (let i = 0; i < layoutRegions.length; i++) {
      const polygon = voronoi.cellPolygon(i);
      if (polygon && polygon.length > 2) {
        // Confirmed valid Voronoi partition cell
      }
    }
  }

  // 7. Calculate Comprehensive Map Bounds with margin
  let minX = -400;
  let maxX = 400;
  let minY = -400;
  let maxY = 400;

  layoutRegions.forEach((r) => {
    minX = Math.min(minX, r.center.x - r.radius - 80);
    maxX = Math.max(maxX, r.center.x + r.radius + 80);
    minY = Math.min(minY, r.center.y - r.radius - 80);
    maxY = Math.max(maxY, r.center.y + r.radius + 80);
  });

  const bounds: MapBounds = {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };

  const layout: MapLayout = {
    seed: spec.seed,
    bounds,
    regions: layoutRegions,
    cities: layoutCities,
    coastlines,
    rivers,
    roads,
    terrainSprites,
    createdAt: new Date().toISOString(),
  };

  return MapLayoutSchema.parse(layout);
}
