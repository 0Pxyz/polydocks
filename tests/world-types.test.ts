import { describe, it, expect } from "bun:test";
import {
  MapSpecSchema,
  MapLayoutSchema,
  StylePackSchema,
  CityBundleSchema,
} from "../src/features/world/types";

describe("World Architecture Typed Boundaries (Zod Schemas)", () => {
  it("validates semantic MapSpec without coordinate or pixel data", () => {
    const validSemanticSpec = {
      id: "world-ai-phil",
      seed: "meta-seed-42",
      title: "World of Knowledge",
      regions: [
        {
          id: "reg-ai",
          title: "Artificial Intelligence",
          topic: "Computer Science & Machine Learning",
          cities: [
            { id: "city-nn", title: "Neural Networks", tags: ["deep learning", "math"], level: 2 },
            { id: "city-transformers", title: "Transformers", tags: ["llm", "attention"], level: 3 },
          ],
        },
      ],
      connections: [
        { fromCityId: "city-nn", toCityId: "city-transformers", kind: "highway" as const },
      ],
    };

    const parsed = MapSpecSchema.parse(validSemanticSpec);
    expect(parsed.seed).toBe("meta-seed-42");
    expect(parsed.regions[0].cities.length).toBe(2);
    expect(parsed.connections[0].kind).toBe("highway");
  });

  it("validates MapLayout geometry specification", () => {
    const validLayout = {
      seed: "layout-seed-1",
      bounds: { minX: -500, maxX: 500, minY: -500, maxY: 500, width: 1000, height: 1000 },
      regions: [
        {
          id: "reg-ai",
          title: "AI",
          topic: "AI",
          center: { x: 0, y: 0 },
          radius: 200,
          color: "#C8FF57",
          accentColor: "rgba(200, 255, 87, 0.2)",
          hull: [{ x: -100, y: -100 }, { x: 100, y: -100 }, { x: 0, y: 100 }],
          cities: ["city-nn"],
        },
      ],
      cities: [
        {
          id: "city-nn",
          title: "Neural Networks",
          regionId: "reg-ai",
          level: 2,
          position: { x: 20, y: 30 },
          state: "discovered" as const,
          tags: ["deep learning"],
          questCount: 3,
        },
      ],
      coastlines: [
        { polygon: [{ x: -200, y: -200 }, { x: 200, y: -200 }, { x: 0, y: 200 }], depth: 0 },
      ],
      rivers: [
        { path: [{ x: 0, y: 0 }, { x: 50, y: 100 }], width: 4 },
      ],
      roads: [
        { fromCityId: "c1", toCityId: "c2", points: [{ x: 0, y: 0 }, { x: 50, y: 50 }], kind: "trail" as const },
      ],
      terrainSprites: [
        { kind: "mountain" as const, x: -30, y: 40, scale: 1.2, variant: 0 },
      ],
      createdAt: new Date().toISOString(),
    };

    const parsed = MapLayoutSchema.parse(validLayout);
    expect(parsed.regions.length).toBe(1);
    expect(parsed.cities[0].state).toBe("discovered");
    expect(parsed.terrainSprites[0].kind).toBe("mountain");
  });

  it("validates StylePack definitions for atlas and aurora", () => {
    const atlasStyle = {
      id: "atlas" as const,
      name: "Cartographic Atlas",
      palette: {
        oceanDeep: "#090d16",
        oceanShallow: "#0f172a",
        oceanBorder: "#1e293b",
        landBase: "#131b2e",
        landHighlight: "#1e2c4a",
        hillshade: "rgba(0,0,0,0.4)",
        coastlineGlow: "rgba(87, 200, 255, 0.3)",
        riverColor: "#38bdf8",
        roadColor: "#94a3b8",
        regionBorderDash: "#64748b",
        textPrimary: "#f8fafc",
        textMuted: "#64748b",
        graticuleColor: "rgba(255, 255, 255, 0.04)",
        vignetteIntensity: 0.6,
      },
    };

    const parsed = StylePackSchema.parse(atlasStyle);
    expect(parsed.id).toBe("atlas");
  });

  it("validates CityBundle structure for living city workspaces", () => {
    const bundle = {
      cityId: "city-stoicism",
      topic: "Stoicism",
      sources: [
        {
          title: "Meditations by Marcus Aurelius",
          url: "https://en.wikipedia.org/wiki/Meditations",
          kind: "paper" as const,
          why: "Foundational Roman Stoic text on self-discipline and reflection",
          level: "beginner" as const,
        },
      ],
      concepts: [
        {
          title: "Dichotomy of Control",
          explanation: "Distinguishing between what is within our power and what is not.",
          keyQuestions: ["What belongs to the self vs external events?"],
        },
      ],
      overview: "# Stoicism\nAn ancient Greco-Roman school of philosophy.",
      quests: [
        {
          id: "quest-1",
          tier: "novice" as const,
          title: "The Inner Citadel",
          description: "Read chapter 2 of Meditations and identify 3 key principles.",
          tasks: ["Read excerpt", "Identify core discipline", "Reflect on control"],
        },
      ],
      glossary: { Ataraxia: "Tranquility of mind" },
    };

    const parsed = CityBundleSchema.parse(bundle);
    expect(parsed.cityId).toBe("city-stoicism");
    expect(parsed.quests[0].tier).toBe("novice");
    expect(parsed.glossary["Ataraxia"]).toBe("Tranquility of mind");
  });

  it("validates Maps v2 MapSource and CityPoint Zod schemas with normalized coordinates", () => {
    const { MapSourceSchema, CityPointSchema } = require("../src/features/world/types");

    const validMapSource = {
      id: "gloom",
      name: "Abyssal Gloom",
      style: "gloom",
      kind: "bundled" as const,
      image: { url: "/maps/gloom/map.webp", width: 2048, height: 1152 },
      thumbnail: "/maps/gloom/thumb.webp",
      regions: [{ id: "reg-1", name: "Aethelgard", cx: 0.35, cy: 0.45 }],
      sites: [{ id: "site-1", name: "Spire", x: 0.32, y: 0.42, regionId: "reg-1", importance: 1.0 }],
      license: "MIT",
    };

    const parsedMap = MapSourceSchema.parse(validMapSource);
    expect(parsedMap.id).toBe("gloom");
    expect(parsedMap.regions?.[0].cx).toBe(0.35);

    const validCityPoint = {
      id: "pt-stoic",
      mapId: "gloom",
      cityId: "city-stoicism",
      title: "Stoicism",
      x: 0.32,
      y: 0.42,
      status: "discovered" as const,
    };

    const parsedPoint = CityPointSchema.parse(validCityPoint);
    expect(parsedPoint.cityId).toBe("city-stoicism");
    expect(parsedPoint.status).toBe("discovered");

    // Invalid coordinate > 1 must fail
    expect(() => CityPointSchema.parse({ ...validCityPoint, x: 1.5 })).toThrow();
  });
});
