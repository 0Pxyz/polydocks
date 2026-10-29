import { describe, it, expect } from "bun:test";
import {
  buildKnowledgeWorldSpec,
  cityPosition,
  biomeForCity,
  landmarkForCity,
  hashString,
  type CitySummary,
} from "../src/features/world/knowledgeWorld";

const CITIES: CitySummary[] = [
  { id: "neural-networks", title: "Neural Networks", region: "Aethelgard Reach", level: 1, tags: ["deep-learning"] },
  { id: "statistics", title: "Statistics", region: "Sunken Highlands", level: 1, tags: ["probability"] },
  { id: "poker-strategy", title: "Poker Strategy", region: "Obsidian Caldera", level: 1, tags: ["game-theory"] },
];

describe("Unified knowledge world spec", () => {
  it("creates exactly one territory per city with stable identity", () => {
    const spec = buildKnowledgeWorldSpec(CITIES, []);
    expect(spec.regions.length).toBe(3);
    for (const city of CITIES) {
      const region = spec.regions.find((r) => r.id === city.id);
      expect(region).toBeDefined();
      expect(region!.label).toBe(city.title);
      expect(region!.cityId).toBe(city.id);
      expect(region!.position).toBeDefined();
    }
  });

  it("derives positions only from city ids (stable when the set grows)", () => {
    const before = buildKnowledgeWorldSpec(CITIES, []);
    const grown: CitySummary[] = [
      ...CITIES,
      { id: "game-theory", title: "Game Theory", region: "Obsidian Caldera", level: 1, tags: ["game-theory"] },
    ];
    const after = buildKnowledgeWorldSpec(grown, []);
    for (const city of CITIES) {
      const a = before.regions.find((r) => r.id === city.id)!;
      const b = after.regions.find((r) => r.id === city.id)!;
      expect(b.position).toEqual(a.position);
      expect(cityPosition(city.id)).toEqual(a.position);
    }
  });

  it("is fully deterministic across runs", () => {
    const a = buildKnowledgeWorldSpec(CITIES, [{ from: "neural-networks", to: "statistics" }]);
    const b = buildKnowledgeWorldSpec(CITIES, [{ from: "neural-networks", to: "statistics" }]);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("inherits canonical concepts for known cities, tags otherwise", () => {
    const spec = buildKnowledgeWorldSpec(CITIES, []);
    const nn = spec.regions.find((r) => r.id === "neural-networks")!;
    const labels = nn.concepts.map((c) => (typeof c === "string" ? c : c.label));
    expect(labels).toContain("Perceptrons");
    expect(labels).toContain("Backpropagation");

    const poker = spec.regions.find((r) => r.id === "poker-strategy")!;
    expect(poker.concepts.length).toBeGreaterThan(0);
  });

  it("links canonical cross-city regions (transformers <-> neural-networks)", () => {
    const cities: CitySummary[] = [
      { id: "neural-networks", title: "Neural Networks", region: "R", level: 1, tags: [] },
      { id: "transformers", title: "Transformers", region: "R", level: 1, tags: [] },
    ];
    const spec = buildKnowledgeWorldSpec(cities, []);
    const nn = spec.regions.find((r) => r.id === "neural-networks")!;
    expect(nn.connections).toContain("transformers");
  });

  it("links cities with shared tags and explicit world links", () => {
    const spec = buildKnowledgeWorldSpec(CITIES, [
      { from: "neural-networks", to: "statistics", reason: "optimization" },
    ]);
    const nn = spec.regions.find((r) => r.id === "neural-networks")!;
    const stats = spec.regions.find((r) => r.id === "statistics")!;
    expect(nn.connections).toContain("statistics");
    expect(stats.connections).toContain("neural-networks");

    // Shared tag game-theory links poker <-> game-theory (added below)
    const grown: CitySummary[] = [
      ...CITIES,
      { id: "game-theory", title: "Game Theory", region: "Elsewhere", level: 1, tags: ["game-theory"] },
    ];
    const spec2 = buildKnowledgeWorldSpec(grown, []);
    const poker = spec2.regions.find((r) => r.id === "poker-strategy")!;
    expect(poker.connections).toContain("game-theory");
  });

  it("ignores links and tags pointing at unknown cities", () => {
    const spec = buildKnowledgeWorldSpec(CITIES, [{ from: "neural-networks", to: "nope" }]);
    const nn = spec.regions.find((r) => r.id === "neural-networks")!;
    expect(nn.connections).not.toContain("nope");
  });

  it("derives biome and landmark deterministically from the id", () => {
    expect(biomeForCity("neural-networks")).toBe(biomeForCity("neural-networks"));
    expect(landmarkForCity("neural-networks")).toBe(landmarkForCity("neural-networks"));
    expect(hashString("neural-networks")).toBe(hashString("neural-networks"));
  });
});
