import { z } from "zod";

// ==========================================
// 1. Semantic Layer: MapSpec (Agent Interface)
// No coordinates, no pixels. Pure knowledge graph.
// ==========================================

export const SemanticCitySchema = z.object({
  id: z.string(),
  title: z.string(),
  tags: z.array(z.string()).default([]),
  description: z.string().optional(),
  level: z.number().int().min(1).max(10).default(1),
});

export type SemanticCity = z.infer<typeof SemanticCitySchema>;

export const SemanticRegionSchema = z.object({
  id: z.string(),
  title: z.string(),
  topic: z.string(),
  color: z.string().optional(),
  accentColor: z.string().optional(),
  cities: z.array(SemanticCitySchema),
});

export type SemanticRegion = z.infer<typeof SemanticRegionSchema>;

export const SemanticConnectionSchema = z.object({
  fromCityId: z.string(),
  toCityId: z.string(),
  kind: z.enum(["highway", "trail", "bridge"]).default("trail"),
});

export type SemanticConnection = z.infer<typeof SemanticConnectionSchema>;

export const MapSpecSchema = z.object({
  id: z.string().default("world-default"),
  seed: z.string().default("polymax-seed"),
  title: z.string().default("The World of Knowledge"),
  regions: z.array(SemanticRegionSchema),
  connections: z.array(SemanticConnectionSchema).default([]),
  createdAt: z.string().default(() => new Date().toISOString()),
});

export type MapSpec = z.infer<typeof MapSpecSchema>;

// ==========================================
// 2. Geometry & Layout Layer: MapLayout
// Deterministic 2D layout generated from MapSpec.
// ==========================================

export const Point2DSchema = z.object({
  x: z.number(),
  y: z.number(),
});

export type Point2D = z.infer<typeof Point2DSchema>;

export const MapBoundsSchema = z.object({
  minX: z.number(),
  maxX: z.number(),
  minY: z.number(),
  maxY: z.number(),
  width: z.number(),
  height: z.number(),
});

export type MapBounds = z.infer<typeof MapBoundsSchema>;

export const CityStateSchema = z.enum(["undiscovered", "building", "discovered", "mastered"]);
export type CityState = z.infer<typeof CityStateSchema>;

export const LayoutCitySchema = z.object({
  id: z.string(),
  title: z.string(),
  regionId: z.string(),
  level: z.number(),
  position: Point2DSchema,
  state: CityStateSchema.default("discovered"),
  buildingProgress: z.number().min(0).max(1).optional(),
  tags: z.array(z.string()).default([]),
  description: z.string().optional(),
  questCount: z.number().optional().default(0),
});

export type LayoutCity = z.infer<typeof LayoutCitySchema>;

export const LayoutRegionSchema = z.object({
  id: z.string(),
  title: z.string(),
  topic: z.string(),
  center: Point2DSchema,
  radius: z.number(),
  color: z.string(),
  accentColor: z.string(),
  hull: z.array(Point2DSchema),
  cities: z.array(z.string()),
});

export type LayoutRegion = z.infer<typeof LayoutRegionSchema>;

export const CoastlineSchema = z.object({
  polygon: z.array(Point2DSchema),
  depth: z.number().default(0),
});

export type Coastline = z.infer<typeof CoastlineSchema>;

export const RiverSchema = z.object({
  path: z.array(Point2DSchema),
  width: z.number(),
});

export type River = z.infer<typeof RiverSchema>;

export const RoadSchema = z.object({
  fromCityId: z.string(),
  toCityId: z.string(),
  points: z.array(Point2DSchema),
  kind: z.enum(["highway", "trail", "bridge"]),
});

export type Road = z.infer<typeof RoadSchema>;

export const TerrainSpriteSchema = z.object({
  kind: z.enum(["mountain", "hill", "forest", "ruins"]),
  x: z.number(),
  y: z.number(),
  scale: z.number(),
  variant: z.number(),
});

export type TerrainSprite = z.infer<typeof TerrainSpriteSchema>;

export const MapLayoutSchema = z.object({
  seed: z.string(),
  bounds: MapBoundsSchema,
  regions: z.array(LayoutRegionSchema),
  cities: z.array(LayoutCitySchema),
  coastlines: z.array(CoastlineSchema),
  rivers: z.array(RiverSchema),
  roads: z.array(RoadSchema),
  terrainSprites: z.array(TerrainSpriteSchema),
  createdAt: z.string(),
});

export type MapLayout = z.infer<typeof MapLayoutSchema>;

// ==========================================
// 3. Renderer & Cartography Style Layer: StylePack
// ==========================================

export const StylePackSchema = z.object({
  id: z.enum(["atlas", "aurora"]),
  name: z.string(),
  palette: z.object({
    oceanDeep: z.string(),
    oceanShallow: z.string(),
    oceanBorder: z.string(),
    landBase: z.string(),
    landHighlight: z.string(),
    hillshade: z.string(),
    coastlineGlow: z.string(),
    riverColor: z.string(),
    roadColor: z.string(),
    regionBorderDash: z.string(),
    textPrimary: z.string(),
    textMuted: z.string(),
    graticuleColor: z.string(),
    vignetteIntensity: z.number(),
  }),
});

export type StylePack = z.infer<typeof StylePackSchema>;

// ==========================================
// 4. Living City Layer: CityBundle (Staged Builder Output)
// ==========================================

export const CitySourceSchema = z.object({
  title: z.string(),
  url: z.string(),
  kind: z.enum(["article", "video", "paper", "course"]),
  why: z.string(),
  level: z.enum(["beginner", "intermediate", "advanced"]),
  markdownContent: z.string().optional(),
});

export type CitySource = z.infer<typeof CitySourceSchema>;

export const CityConceptSchema = z.object({
  title: z.string(),
  explanation: z.string(),
  keyQuestions: z.array(z.string()).default([]),
});

export type CityConcept = z.infer<typeof CityConceptSchema>;

export const CityQuestSchema = z.object({
  id: z.string(),
  tier: z.enum(["novice", "practitioner", "master"]),
  title: z.string(),
  description: z.string(),
  tasks: z.array(z.string()),
  sourceUrl: z.string().optional(),
});

export type CityQuest = z.infer<typeof CityQuestSchema>;

export const CityBundleSchema = z.object({
  cityId: z.string(),
  topic: z.string(),
  sources: z.array(CitySourceSchema),
  concepts: z.array(CityConceptSchema),
  overview: z.string(),
  quests: z.array(CityQuestSchema),
  glossary: z.record(z.string(), z.string()).default({}),
  microApp: z
    .object({
      id: z.string(),
      title: z.string(),
      icon: z.string(),
      html: z.string(),
    })
    .optional(),
  generatedAt: z.string().default(() => new Date().toISOString()),
});

export type CityBundle = z.infer<typeof CityBundleSchema>;

export interface CityBuildEvent {
  type:
    | "stage.start"
    | "source.found"
    | "concept.extracted"
    | "quest.created"
    | "progress"
    | "city.ready"
    | "error";
  stage?: string;
  progress?: number;
  message?: string;
  payload?: unknown;
}

// ==========================================
// 5. Camera & Navigation State
// ==========================================

export interface CameraState {
  x: number;
  y: number;
  zoom: number;
}

export type SemanticZoomLevel = "regional" | "city" | "neighborhood";

// ==========================================
// 6. Maps v2 Core Contracts (MapSource & CityPoint)
// The map is only the visual layer. A city is a point on it.
// ==========================================

export const MapRegionSpecSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string().optional(),
  cx: z.number().min(0).max(1),
  cy: z.number().min(0).max(1),
});
export type MapRegionSpec = z.infer<typeof MapRegionSpecSchema>;

export const MapSiteSpecSchema = z.object({
  id: z.string(),
  name: z.string(),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  regionId: z.string().optional(),
  importance: z.number().optional(),
});
export type MapSiteSpec = z.infer<typeof MapSiteSpecSchema>;

export const MapSourceSchema = z.object({
  id: z.string(),
  name: z.string(),
  style: z.string(),
  kind: z.enum(["bundled", "imported"]),
  image: z.object({
    url: z.string(),
    width: z.number().positive(),
    height: z.number().positive(),
  }),
  thumbnail: z.string(),
  regions: z.array(MapRegionSpecSchema).optional(),
  sites: z.array(MapSiteSpecSchema).optional(),
  license: z.string(),
});
export type MapSource = z.infer<typeof MapSourceSchema>;

export const CityPointStatusSchema = z.enum(["undiscovered", "building", "discovered", "mastered"]);
export type CityPointStatus = z.infer<typeof CityPointStatusSchema>;

export const CityPointSchema = z.object({
  id: z.string(),
  mapId: z.string(),
  cityId: z.string(),
  title: z.string().optional(),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  status: CityPointStatusSchema,
});
export type CityPoint = z.infer<typeof CityPointSchema>;

export interface CityBuilder {
  buildCity(cityId: string, topic: string): Promise<void>;
}
