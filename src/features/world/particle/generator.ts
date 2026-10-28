/**
 * Procedural Particle World Generator
 * Pure, deterministic generation of particle territories, landmark constellations,
 * boundary hulls, and inter-region conduits.
 */

import type {
  ParticleWorldSpec,
  ParticleWorld,
  TerritoryCluster,
  Particle,
  PathConduit,
  ParticleBiome,
  ParticleConcept,
  ParticleEngineOptions,
} from "./types";

/**
 * Mulberry32 32-bit deterministic Pseudo-Random Number Generator.
 */
export function createMulberry32(seed: number) {
  let s = Math.floor(seed);
  return function next(): number {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Semantic biome color palettes based on tokens.css void aesthetic.
 */
export const BIOME_PALETTES: Record<
  ParticleBiome,
  { core: string; accent: string; dim: string }
> = {
  plains: {
    core: "#4ADE80", // Sage / Emerald
    accent: "#86EFAC",
    dim: "rgba(74, 222, 128, 0.25)",
  },
  mountains: {
    core: "#38BDF8", // Cyan / Azure
    accent: "#7DD3FC",
    dim: "rgba(56, 189, 248, 0.25)",
  },
  forest: {
    core: "#C8FF57", // Polymax Electric Lime
    accent: "#D9F99D",
    dim: "rgba(200, 255, 87, 0.25)",
  },
  caldera: {
    core: "#F59E0B", // Solar Amber
    accent: "#FDE68A",
    dim: "rgba(245, 158, 11, 0.25)",
  },
  desert: {
    core: "#A855F7", // Nebula Violet
    accent: "#D8B4FE",
    dim: "rgba(168, 85, 247, 0.25)",
  },
  ocean: {
    core: "#2DD4BF", // Deep Sea Teal
    accent: "#99F6E4",
    dim: "rgba(45, 212, 191, 0.25)",
  },
  tundra: {
    core: "#94A3B8", // Frost Slate
    accent: "#E2E8F0",
    dim: "rgba(148, 163, 184, 0.25)",
  },
};

/**
 * Evaluates a point along a cubic bezier curve at parameter t in [0, 1].
 */
export function getCubicBezierPoint(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  t: number
): { x: number; y: number } {
  const oneMinusT = 1 - t;
  const mt2 = oneMinusT * oneMinusT;
  const mt3 = mt2 * oneMinusT;
  const t2 = t * t;
  const t3 = t2 * t;

  return {
    x:
      mt3 * p0.x +
      3 * mt2 * t * p1.x +
      3 * oneMinusT * t2 * p2.x +
      t3 * p3.x,
    y:
      mt3 * p0.y +
      3 * mt2 * t * p1.y +
      3 * oneMinusT * t2 * p2.y +
      t3 * p3.y,
  };
}

/**
 * Generates a full procedural particle world deterministically.
 */
export function generateParticleWorld(
  spec: ParticleWorldSpec,
  options: ParticleEngineOptions = {}
): ParticleWorld {
  const width = options.width ?? 1400;
  const height = options.height ?? 850;
  const seed = options.customSeed ?? spec.seed;
  const particlesPerTerritory = options.particlesPerTerritory ?? 85;
  const ambientDensity = options.ambientDensity ?? 45;

  const rng = createMulberry32(seed);

  const territories = new Map<string, TerritoryCluster>();
  const allParticles: Particle[] = [];
  const conduits: PathConduit[] = [];
  const ambientParticles: Particle[] = [];

  let nextParticleId = 1;

  // 1. Establish Territory Centers
  const paddingX = width * 0.12;
  const paddingY = height * 0.14;
  const availableWidth = width - 2 * paddingX;
  const availableHeight = height - 2 * paddingY;

  const regionCenters = new Map<string, { x: number; y: number }>();

  spec.regions.forEach((region, index) => {
    let cx: number;
    let cy: number;

    if (region.position) {
      // Use normalized position with controlled organic jitter
      const jitterX = (rng() - 0.5) * 24;
      const jitterY = (rng() - 0.5) * 24;
      cx = paddingX + region.position.x * availableWidth + jitterX;
      cy = paddingY + region.position.y * availableHeight + jitterY;
    } else {
      // Radial arrangement fallback
      const angle = (index / spec.regions.length) * Math.PI * 2;
      const radiusX = availableWidth * 0.4;
      const radiusY = availableHeight * 0.38;
      cx = width / 2 + Math.cos(angle) * radiusX + (rng() - 0.5) * 30;
      cy = height / 2 + Math.sin(angle) * radiusY + (rng() - 0.5) * 30;
    }

    regionCenters.set(region.id, { x: Math.round(cx), y: Math.round(cy) });
  });

  // 2. Build Each Territory Cluster
  spec.regions.forEach((region) => {
    const center = regionCenters.get(region.id)!;
    const palette = BIOME_PALETTES[region.biome] || BIOME_PALETTES.plains;
    const territoryRadius = 80 + rng() * 35; // 80 - 115px
    const territoryParticles: Particle[] = [];
    const status = spec.progression?.[region.id] ?? "discovered";

    // Transform concepts
    const concepts: ParticleConcept[] = region.concepts.map((c) => {
      if (typeof c === "string") {
        return { id: c, label: c, status: "discovered" };
      }
      return c;
    });

    // 2a. Landmark Anchor Particle
    const landmarkParticle: Particle = {
      id: nextParticleId++,
      x: center.x,
      y: center.y,
      baseX: center.x,
      baseY: center.y,
      baseRadius: 4.8,
      currentRadius: 4.8,
      color: palette.accent,
      alpha: 1.0,
      baseAlpha: 1.0,
      regionId: region.id,
      isLandmark: true,
      phase: rng() * Math.PI * 2,
      speed: 0.6 + rng() * 0.4,
    };
    territoryParticles.push(landmarkParticle);
    allParticles.push(landmarkParticle);

    // 2b. Orbital Satellite Motes (constellation around landmark)
    const orbitCount = 5;
    for (let o = 0; o < orbitCount; o++) {
      const orbitAngle = (o / orbitCount) * Math.PI * 2 + rng() * 0.4;
      const orbitRadius = 14 + rng() * 12;
      const satelliteParticle: Particle = {
        id: nextParticleId++,
        x: center.x + Math.cos(orbitAngle) * orbitRadius,
        y: center.y + Math.sin(orbitAngle) * orbitRadius,
        baseX: center.x,
        baseY: center.y,
        baseRadius: 1.6,
        currentRadius: 1.6,
        color: palette.core,
        alpha: 0.85,
        baseAlpha: 0.85,
        regionId: region.id,
        phase: rng() * Math.PI * 2,
        speed: 1.0,
        orbitRadius,
        orbitAngle,
        orbitSpeed: (0.3 + rng() * 0.4) * (rng() > 0.5 ? 1 : -1),
      };
      territoryParticles.push(satelliteParticle);
      allParticles.push(satelliteParticle);
    }

    // 2c. Territory Island Body Particles
    const harmonicLobes = 3 + Math.floor(rng() * 3); // 3-5 organic lobes
    const harmonicPhase = rng() * Math.PI * 2;

    for (let p = 0; p < particlesPerTerritory; p++) {
      // Polar distribution with power falloff (denser in core, organic dropoff)
      const u = rng();
      const theta = rng() * Math.PI * 2;

      // Harmonic radius perturbation
      const shapeDistortion = 1 + 0.28 * Math.cos(harmonicLobes * theta + harmonicPhase);
      const r = territoryRadius * Math.sqrt(u) * shapeDistortion;

      const px = center.x + Math.cos(theta) * r;
      const py = center.y + Math.sin(theta) * r;

      // Particle size & alpha inversely proportional to distance from center
      const distRatio = Math.min(r / territoryRadius, 1);
      const radius = 1.1 + (1 - distRatio) * 1.8 + rng() * 0.6;
      const alpha = Math.max(0.18, (1 - distRatio * 0.8) * 0.9);

      const particle: Particle = {
        id: nextParticleId++,
        x: px,
        y: py,
        baseX: px,
        baseY: py,
        baseRadius: Math.round(radius * 10) / 10,
        currentRadius: Math.round(radius * 10) / 10,
        color: palette.core,
        alpha,
        baseAlpha: alpha,
        regionId: region.id,
        phase: rng() * Math.PI * 2,
        speed: 0.4 + rng() * 0.6,
      };

      territoryParticles.push(particle);
      allParticles.push(particle);
    }

    // 2d. Boundary Hull Points (smooth organic polygon)
    const hullSegments = 16;
    const boundaryPoints: { x: number; y: number }[] = [];
    for (let i = 0; i < hullSegments; i++) {
      const angle = (i / hullSegments) * Math.PI * 2;
      const distortion = 1 + 0.22 * Math.cos(harmonicLobes * angle + harmonicPhase);
      const hullRadius = territoryRadius * 1.08 * distortion;
      boundaryPoints.push({
        x: center.x + Math.cos(angle) * hullRadius,
        y: center.y + Math.sin(angle) * hullRadius,
      });
    }

    territories.set(region.id, {
      id: region.id,
      label: region.label,
      summary: region.summary,
      landmark: region.landmark,
      color: palette.core,
      accentColor: palette.accent,
      center,
      radius: territoryRadius,
      particles: territoryParticles,
      boundaryPoints,
      concepts,
      region,
      status,
    });
  });

  // 3. Inter-Region Conduits (Bezier Curves & Flow Particles)
  const connectedPairs = new Set<string>();

  spec.regions.forEach((region) => {
    const fromCenter = regionCenters.get(region.id);
    if (!fromCenter) return;

    region.connections.forEach((targetId) => {
      const toCenter = regionCenters.get(targetId);
      if (!toCenter) return;

      // Ensure single undirected edge
      const pairKey = [region.id, targetId].sort().join("<->");
      if (connectedPairs.has(pairKey)) return;
      connectedPairs.add(pairKey);

      // Curved Spline Control Points
      const dx = toCenter.x - fromCenter.x;
      const dy = toCenter.y - fromCenter.y;
      const dist = Math.hypot(dx, dy);

      // Normal vector perpendicular to chord
      const nx = -dy / dist;
      const ny = dx / dist;

      // Seed-based bow curvature
      const bow = (rng() - 0.5) * Math.min(dist * 0.35, 60);

      const cp1 = {
        x: fromCenter.x + dx * 0.33 + nx * bow,
        y: fromCenter.y + dy * 0.33 + ny * bow,
      };
      const cp2 = {
        x: fromCenter.x + dx * 0.67 + nx * bow,
        y: fromCenter.y + dy * 0.67 + ny * bow,
      };

      // Flow particles along the conduit
      const conduitParticles: Particle[] = [];
      const particleCount = Math.max(6, Math.min(14, Math.floor(dist / 40)));

      for (let cp = 0; cp < particleCount; cp++) {
        const progress = cp / particleCount + rng() * (1 / particleCount);
        const pt = getCubicBezierPoint(fromCenter, cp1, cp2, toCenter, progress);

        const flowParticle: Particle = {
          id: nextParticleId++,
          x: pt.x,
          y: pt.y,
          baseX: pt.x,
          baseY: pt.y,
          baseRadius: 1.4,
          currentRadius: 1.4,
          color: "#E4E4E7", // Zinc-200
          alpha: 0.55,
          baseAlpha: 0.55,
          isPath: true,
          pathId: pairKey,
          pathProgress: progress,
          pathSpeed: 0.0012 + rng() * 0.001,
          phase: rng() * Math.PI * 2,
          speed: 1.0,
        };

        conduitParticles.push(flowParticle);
        allParticles.push(flowParticle);
      }

      conduits.push({
        id: pairKey,
        fromRegionId: region.id,
        toRegionId: targetId,
        from: fromCenter,
        to: toCenter,
        controlPoint1: cp1,
        controlPoint2: cp2,
        length: dist,
        color: "rgba(161, 161, 170, 0.22)", // Subtle Zinc
        particles: conduitParticles,
      });
    });
  });

  // 4. Sparse Negative Space Motes (Ambient Background Stars)
  for (let a = 0; a < ambientDensity; a++) {
    const ax = rng() * width;
    const ay = rng() * height;

    // Check if ambient mote is too close to any territory center
    let tooClose = false;
    for (const center of regionCenters.values()) {
      if (Math.hypot(ax - center.x, ay - center.y) < 95) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) continue;

    const ambientParticle: Particle = {
      id: nextParticleId++,
      x: ax,
      y: ay,
      baseX: ax,
      baseY: ay,
      baseRadius: 0.8 + rng() * 0.6,
      currentRadius: 0.8 + rng() * 0.6,
      color: "#71717A", // Zinc-500
      alpha: 0.12 + rng() * 0.18,
      baseAlpha: 0.12 + rng() * 0.18,
      phase: rng() * Math.PI * 2,
      speed: 0.2 + rng() * 0.3,
    };

    ambientParticles.push(ambientParticle);
    allParticles.push(ambientParticle);
  }

  return {
    spec,
    seed,
    width,
    height,
    territories,
    allParticles,
    conduits,
    ambientParticles,
  };
}
