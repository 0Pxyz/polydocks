import { describe, it, expect } from "bun:test";
import { generateMapLayout } from "../src/lib/mapgen/proceduralWorld";
import type { MapSpec } from "../src/features/world/types";

describe("Procedural World Layout Engine (generateMapLayout)", () => {
  const baseSpec: MapSpec = {
    id: "spec-knowledge-1",
    seed: "polymax-test-seed",
    title: "World of Knowledge",
    createdAt: new Date().toISOString(),
    regions: [
      {
        id: "reg-ai",
        title: "Artificial Intelligence",
        topic: "AI & ML",
        cities: [
          { id: "city-nn", title: "Neural Networks", tags: ["ml"], level: 1 },
          { id: "city-transformers", title: "Transformers", tags: ["nlp"], level: 2 },
        ],
      },
      {
        id: "reg-phil",
        title: "Philosophy",
        topic: "Ethics & Mind",
        cities: [
          { id: "city-stoicism", title: "Stoicism", tags: ["virtue"], level: 1 },
        ],
      },
    ],
    connections: [],
  };

  it("produces deterministic layout for identical seed and spec", () => {
    const layout1 = generateMapLayout(baseSpec);
    const layout2 = generateMapLayout(baseSpec);

    expect(layout1.regions.length).toBe(2);
    expect(layout1.cities.length).toBe(3);
    expect(layout1.cities).toEqual(layout2.cities);
    expect(layout1.coastlines).toEqual(layout2.coastlines);
    expect(layout1.rivers).toEqual(layout2.rivers);
    expect(layout1.terrainSprites).toEqual(layout2.terrainSprites);
  });

  it("STABILITY GUARANTEE: Adding a city NEVER moves existing cities", () => {
    const layoutBefore = generateMapLayout(baseSpec);
    const nnBefore = layoutBefore.cities.find((c) => c.id === "city-nn");
    const transBefore = layoutBefore.cities.find((c) => c.id === "city-transformers");
    const stoicBefore = layoutBefore.cities.find((c) => c.id === "city-stoicism");

    expect(nnBefore).toBeDefined();
    expect(transBefore).toBeDefined();
    expect(stoicBefore).toBeDefined();

    // Now add a 3rd city to Artificial Intelligence region
    const expandedSpec: MapSpec = {
      ...baseSpec,
      regions: [
        {
          ...baseSpec.regions[0],
          cities: [
            ...baseSpec.regions[0].cities,
            { id: "city-reinforcement-learning", title: "RL", tags: ["agents"], level: 3 },
          ],
        },
        baseSpec.regions[1],
      ],
    };

    const layoutAfter = generateMapLayout(expandedSpec);
    const nnAfter = layoutAfter.cities.find((c) => c.id === "city-nn");
    const transAfter = layoutAfter.cities.find((c) => c.id === "city-transformers");
    const stoicAfter = layoutAfter.cities.find((c) => c.id === "city-stoicism");
    const rlAfter = layoutAfter.cities.find((c) => c.id === "city-reinforcement-learning");

    expect(rlAfter).toBeDefined();
    // Existing city positions must remain strictly invariant
    expect(nnAfter?.position).toEqual(nnBefore!.position);
    expect(transAfter?.position).toEqual(transBefore!.position);
    expect(stoicAfter?.position).toEqual(stoicBefore!.position);
  });

  it("STABILITY GUARANTEE: Adding a city preserves existing region coastlines", () => {
    const layoutBefore = generateMapLayout(baseSpec);
    const expandedSpec: MapSpec = {
      ...baseSpec,
      regions: [
        {
          ...baseSpec.regions[0],
          cities: [
            ...baseSpec.regions[0].cities,
            { id: "city-vision", title: "Computer Vision", tags: ["cv"], level: 2 },
          ],
        },
        baseSpec.regions[1],
      ],
    };

    const layoutAfter = generateMapLayout(expandedSpec);
    // Region 1 (Philosophy) coastlines must remain completely identical
    const regPhilCoastBefore = layoutBefore.coastlines[2]; // reg-phil index
    const regPhilCoastAfter = layoutAfter.coastlines[2];
    expect(regPhilCoastAfter).toEqual(regPhilCoastBefore);
  });

  it("generates natural terrain sprites (mountains, hills, forests, ruins)", () => {
    const layout = generateMapLayout(baseSpec);
    expect(layout.terrainSprites.length).toBeGreaterThan(10);
    const kinds = new Set(layout.terrainSprites.map((s) => s.kind));
    expect(kinds.has("mountain")).toBe(true);
  });

  it("generates downhill rivers and connecting roads", () => {
    const layout = generateMapLayout(baseSpec);
    expect(layout.rivers.length).toBeGreaterThanOrEqual(2);
    expect(layout.roads.length).toBeGreaterThanOrEqual(1);
  });
});
