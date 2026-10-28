import { describe, it, expect } from "bun:test";
import {
  createMulberry32,
  generateParticleWorld,
  BIOME_PALETTES,
  getCubicBezierPoint,
} from "../src/features/world/particle/generator";
import { CANONICAL_WORLDS } from "../src/features/world/ascii/worlds";
import type { ParticleWorldSpec } from "../src/features/world/particle/types";

describe("Procedural Particle World Engine", () => {
  describe("1. Determinism and Reproducibility", () => {
    it("evaluates Mulberry32 PRNG deterministically", () => {
      const rng1 = createMulberry32(42817);
      const rng2 = createMulberry32(42817);

      for (let i = 0; i < 20; i++) {
        expect(rng1()).toBe(rng2());
      }
    });

    it("generates identical particle layouts for the same seed and spec", () => {
      const spec = CANONICAL_WORLDS["neural-networks"] as unknown as ParticleWorldSpec;
      const worldA = generateParticleWorld(spec, { customSeed: 12345 });
      const worldB = generateParticleWorld(spec, { customSeed: 12345 });

      expect(worldA.allParticles.length).toBe(worldB.allParticles.length);
      expect(worldA.conduits.length).toBe(worldB.conduits.length);

      for (let i = 0; i < worldA.allParticles.length; i++) {
        const pa = worldA.allParticles[i];
        const pb = worldB.allParticles[i];
        expect(pa.x).toBe(pb.x);
        expect(pa.y).toBe(pb.y);
        expect(pa.color).toBe(pb.color);
        expect(pa.baseRadius).toBe(pb.baseRadius);
        expect(pa.alpha).toBe(pb.alpha);
      }
    });

    it("generates distinct layouts when given different seeds", () => {
      const spec = CANONICAL_WORLDS["neural-networks"] as unknown as ParticleWorldSpec;
      const worldA = generateParticleWorld(spec, { customSeed: 11111 });
      const worldB = generateParticleWorld(spec, { customSeed: 99999 });

      // Compare non-landmark particle positions
      const firstBodyParticleA = worldA.allParticles.find((p) => !p.isLandmark && !p.isPath);
      const firstBodyParticleB = worldB.allParticles.find((p) => !p.isLandmark && !p.isPath);

      expect(firstBodyParticleA).toBeDefined();
      expect(firstBodyParticleB).toBeDefined();
      expect(firstBodyParticleA!.x).not.toBe(firstBodyParticleB!.x);
    });

    it("evaluates cubic bezier curve endpoints correctly", () => {
      const p0 = { x: 0, y: 0 };
      const p1 = { x: 50, y: 100 };
      const p2 = { x: 150, y: 100 };
      const p3 = { x: 200, y: 0 };

      const start = getCubicBezierPoint(p0, p1, p2, p3, 0);
      const end = getCubicBezierPoint(p0, p1, p2, p3, 1);
      const mid = getCubicBezierPoint(p0, p1, p2, p3, 0.5);

      expect(start.x).toBe(0);
      expect(start.y).toBe(0);
      expect(end.x).toBe(200);
      expect(end.y).toBe(0);
      expect(mid.y).toBeGreaterThan(0);
    });
  });

  describe("2. Canonical World Knowledge Coverage", () => {
    const worldIds = ["neural-networks", "stoicism", "poker"] as const;

    for (const worldId of worldIds) {
      it(`renders canonical world "${worldId}" with semantic territories and landmarks`, () => {
        const spec = CANONICAL_WORLDS[worldId] as unknown as ParticleWorldSpec;
        expect(spec).toBeDefined();

        const world = generateParticleWorld(spec);

        expect(world.territories.size).toBe(spec.regions.length);

        spec.regions.forEach((region) => {
          const territory = world.territories.get(region.id);
          expect(territory).toBeDefined();
          expect(territory!.label).toBe(region.label);
          expect(territory!.landmark).toBe(region.landmark);
          expect(territory!.radius).toBeGreaterThan(50);
          expect(territory!.boundaryPoints.length).toBeGreaterThanOrEqual(12);

          // Verify landmark particle exists at center
          const landmark = territory!.particles.find((p) => p.isLandmark);
          expect(landmark).toBeDefined();
          expect(landmark!.x).toBe(territory!.center.x);
          expect(landmark!.y).toBe(territory!.center.y);

          // Verify concepts are preserved
          expect(territory!.concepts.length).toBe(region.concepts.length);
        });
      });
    }
  });

  describe("3. Territory Topology, Conduits, and Connections", () => {
    it("generates smooth bezier conduits connecting related territories", () => {
      const spec = CANONICAL_WORLDS["neural-networks"] as unknown as ParticleWorldSpec;
      const world = generateParticleWorld(spec);

      expect(world.conduits.length).toBeGreaterThan(0);

      world.conduits.forEach((conduit) => {
        expect(conduit.from).toBeDefined();
        expect(conduit.to).toBeDefined();
        expect(conduit.controlPoint1).toBeDefined();
        expect(conduit.controlPoint2).toBeDefined();
        expect(conduit.length).toBeGreaterThan(0);
        expect(conduit.particles.length).toBeGreaterThanOrEqual(6);

        // Every flow particle has path progress
        conduit.particles.forEach((p) => {
          expect(p.isPath).toBe(true);
          expect(p.pathProgress).toBeGreaterThanOrEqual(0);
          expect(p.pathProgress).toBeLessThanOrEqual(1.1);
        });
      });
    });

    it("avoids duplicate conduits for bidirectional region connections", () => {
      const spec = CANONICAL_WORLDS["neural-networks"] as unknown as ParticleWorldSpec;
      const world = generateParticleWorld(spec);

      const conduitIds = world.conduits.map((c) => c.id);
      const uniqueIds = new Set(conduitIds);
      expect(uniqueIds.size).toBe(conduitIds.length);
    });
  });

  describe("4. Anti-Slop, Density, and Semantic Biomes", () => {
    it("enforces controlled particle density without uniform random clouds", () => {
      const spec = CANONICAL_WORLDS["stoicism"] as unknown as ParticleWorldSpec;
      const world = generateParticleWorld(spec, {
        particlesPerTerritory: 80,
        ambientDensity: 40,
      });

      // Total particles strictly bounded to avoid visual clutter
      expect(world.allParticles.length).toBeLessThan(1000);

      // Most particles belong to a specific territory cluster
      const territoryParticles = world.allParticles.filter((p) => Boolean(p.regionId));
      const ambientParticles = world.allParticles.filter((p) => !p.regionId && !p.isPath);

      expect(territoryParticles.length).toBeGreaterThan(ambientParticles.length * 3);
    });

    it("maps biomes to restrained, semantic token colors", () => {
      expect(BIOME_PALETTES.plains.core).toBe("#4ADE80");
      expect(BIOME_PALETTES.mountains.core).toBe("#38BDF8");
      expect(BIOME_PALETTES.forest.core).toBe("#C8FF57");
      expect(BIOME_PALETTES.caldera.core).toBe("#F59E0B");
      expect(BIOME_PALETTES.desert.core).toBe("#A855F7");
    });
  });
});
