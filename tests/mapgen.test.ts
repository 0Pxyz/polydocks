import { describe, it, expect } from "bun:test";
import { generateMap } from "../src/lib/mapgen/generateMap";
import { PRNG, hashStringToSeed } from "../src/lib/mapgen/prng";
import type { Position2D } from "../src/lib/mapgen/types";

function dist(a: Position2D, b: Position2D): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

describe("Deterministic Procedural Map Generator (generateMap)", () => {
  it("guarantees identical map outputs for identical (interests, seed) pairs", () => {
    const interests = ["Quantum Computing", "Classical Philosophy", "Distributed Systems"];
    const seed = "meta-hackathon-2026";

    const map1 = generateMap(interests, seed);
    const map2 = generateMap(interests, seed);

    expect(map1.regions.length).toBe(3);
    expect(map1.cities.length).toBe(map2.cities.length);

    // Deep equality of all coordinates and properties
    expect(map1.regions).toEqual(map2.regions);
    expect(map1.cities).toEqual(map2.cities);
    expect(map1.connections).toEqual(map2.connections);
    expect(map1.bounds).toEqual(map2.bounds);
  });

  it("produces distinctly different map layouts for different seeds", () => {
    const interests = ["Machine Learning", "Neuroscience"];

    const mapA = generateMap(interests, "seed-alpha");
    const mapB = generateMap(interests, "seed-beta");

    expect(mapA.seed).toBe("seed-alpha");
    expect(mapB.seed).toBe("seed-beta");

    // Coordinates should vary
    const cityA0 = mapA.cities[0].position;
    const cityB0 = mapB.cities[0].position;
    expect(cityA0.x !== cityB0.x || cityA0.y !== cityB0.y).toBe(true);
  });

  it("enforces minimum clearance distance between cities to prevent overlapping", () => {
    const interests = ["Quantum Computing", "Distributed Systems", "Stoicism", "Machine Learning"];
    const map = generateMap(interests, "collision-check-seed", { minCityDistance: 110 });

    const cities = map.cities;
    for (let i = 0; i < cities.length; i++) {
      for (let j = i + 1; j < cities.length; j++) {
        const d = dist(cities[i].position, cities[j].position);
        expect(d).toBeGreaterThanOrEqual(100); // within tolerance of minimum clearance
      }
    }
  });

  it("places cities strictly within their region bounding radius", () => {
    const map = generateMap(["Philosophy", "Neuroscience"], "radius-check");

    map.cities.forEach((city) => {
      const region = map.regions.find((r) => r.id === city.regionId);
      expect(region).toBeDefined();
      if (region) {
        const d = dist(city.position, region.center);
        expect(d).toBeLessThanOrEqual(region.radius);
      }
    });
  });

  it("establishes valid intra-region roads and inter-region bridges", () => {
    const map = generateMap(["Quantum Computing", "Philosophy", "Distributed Systems"], "connectivity-seed");

    expect(map.connections.length).toBeGreaterThan(0);

    const cityIds = new Set(map.cities.map((c) => c.id));

    // Every connection connects valid cities
    map.connections.forEach((conn) => {
      expect(cityIds.has(conn.fromCityId)).toBe(true);
      expect(cityIds.has(conn.toCityId)).toBe(true);
      expect(conn.distance).toBeGreaterThan(0);
      expect(["highway", "trail", "bridge"]).toContain(conn.kind);
    });

    // Check that inter-region bridges exist
    const bridges = map.connections.filter((c) => c.kind === "bridge");
    expect(bridges.length).toBe(3); // 3 regions form a closed loop of bridges
  });

  it("handles edge case: empty interests falls back to defaults gracefully", () => {
    const map = generateMap([], "fallback-seed");
    expect(map.regions.length).toBe(3);
    expect(map.cities.length).toBeGreaterThan(0);
    expect(map.bounds.width).toBeGreaterThan(0);
    expect(map.bounds.height).toBeGreaterThan(0);
  });

  it("handles edge case: single interest centered at origin", () => {
    const map = generateMap(["Solo Astronomy"], "solo-seed");
    expect(map.regions.length).toBe(1);
    expect(map.regions[0].center).toEqual({ x: 0, y: 0 });
    expect(map.cities.length).toBeGreaterThanOrEqual(2);
  });

  it("computes comprehensive global bounding box enclosing all elements", () => {
    const map = generateMap(["Topic A", "Topic B", "Topic C"], "bounds-seed");
    const { bounds, cities, regions } = map;

    expect(bounds.width).toBe(bounds.maxX - bounds.minX);
    expect(bounds.height).toBe(bounds.maxY - bounds.minY);

    cities.forEach((c) => {
      expect(c.position.x).toBeGreaterThan(bounds.minX);
      expect(c.position.x).toBeLessThan(bounds.maxX);
      expect(c.position.y).toBeGreaterThan(bounds.minY);
      expect(c.position.y).toBeLessThan(bounds.maxY);
    });

    regions.forEach((r) => {
      expect(r.center.x).toBeGreaterThan(bounds.minX);
      expect(r.center.x).toBeLessThan(bounds.maxX);
      expect(r.center.y).toBeGreaterThan(bounds.minY);
      expect(r.center.y).toBeLessThan(bounds.maxY);
    });
  });

  it("PRNG utility produces deterministic sequence across calls", () => {
    const prng1 = new PRNG("test-seed");
    const prng2 = new PRNG("test-seed");

    const seq1 = [prng1.next(), prng1.range(10, 20), prng1.int(1, 100)];
    const seq2 = [prng2.next(), prng2.range(10, 20), prng2.int(1, 100)];

    expect(seq1).toEqual(seq2);
    expect(hashStringToSeed("hello")).toBe(hashStringToSeed("hello"));
    expect(hashStringToSeed("hello")).not.toBe(hashStringToSeed("world"));
  });
});
