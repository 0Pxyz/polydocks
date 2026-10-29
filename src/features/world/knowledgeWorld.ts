import type { ParticleWorldSpec, ParticleRegion, ParticleBiome } from "./particle/types";
import { CANONICAL_WORLDS } from "./ascii/worlds";
import type { AsciiWorldSpec } from "./ascii/types";

/**
 * Unified knowledge-world data layer.
 *
 * The particle map renders ONE world where each knowledge city is a
 * territory. Data comes from the canonical backend (workspace folders via
 * GET /api/cities + explicit conceptual links via GET /api/world/links),
 * never from hardcoded topic lists. Visual positions derive deterministically
 * from stable city IDs, so adding a city never moves existing territories.
 */

export interface CitySummary {
  id: string;
  title: string;
  region: string;
  level: number;
  tags: string[];
}

export interface WorldLink {
  from: string;
  to: string;
  reason?: string;
}

export const KNOWLEDGE_WORLD_SEED = 20260214;
export const KNOWLEDGE_WORLD_ID = "polymax-cosmos";

const BIOMES: ParticleBiome[] = ["plains", "mountains", "forest", "caldera", "desert", "ocean", "tundra"];
const LANDMARKS = ["◬", "▲", "◈", "✦", "⚖", "⚙", "◉", "◆", "✧", "❖", "⬢", "◍"];

/** FNV-1a 32-bit hash for stable deterministic derivation from IDs. */
export function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function hash01(input: string, salt: string): number {
  return hashString(`${salt}:${input}`) / 0xffffffff;
}

/** Stable normalized position derived ONLY from the city id. */
export function cityPosition(cityId: string): { x: number; y: number } {
  const angle = hash01(cityId, "angle") * Math.PI * 2;
  const radius = 0.13 + hash01(cityId, "radius") * 0.24;
  const x = Math.min(0.92, Math.max(0.08, 0.5 + Math.cos(angle) * radius));
  const y = Math.min(0.9, Math.max(0.1, 0.5 + Math.sin(angle) * radius * 0.9));
  return { x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 };
}

export function biomeForCity(cityId: string): ParticleBiome {
  return BIOMES[hashString(`biome:${cityId}`) % BIOMES.length];
}

export function landmarkForCity(cityId: string): string {
  return LANDMARKS[hashString(`landmark:${cityId}`) % LANDMARKS.length];
}

interface CanonicalRegionInfo {
  label: string;
  summary: string;
  concepts: { id: string; label: string; description?: string }[];
  connections: string[];
}

function canonicalRegionsByCity(): Map<string, CanonicalRegionInfo[]> {
  const byCity = new Map<string, CanonicalRegionInfo[]>();
  for (const world of Object.values(CANONICAL_WORLDS) as unknown as AsciiWorldSpec[]) {
    for (const region of world.regions) {
      const cityId = (region as { cityId?: string }).cityId;
      if (!cityId) continue;
      const list = byCity.get(cityId) || [];
      list.push({
        label: region.label,
        summary: region.summary,
        concepts: region.concepts.map((c) =>
          typeof c === "string" ? { id: c, label: c } : { id: c.id, label: c.label, description: c.description }
        ),
        connections: [...region.connections],
      });
      byCity.set(cityId, list);
    }
  }
  return byCity;
}

/** Canonical cross-city links: region A (city X) -> region B (city Y), X != Y. */
function canonicalCityLinks(): { from: string; to: string }[] {
  const regionCity = new Map<string, string>();
  for (const world of Object.values(CANONICAL_WORLDS) as unknown as AsciiWorldSpec[]) {
    for (const region of world.regions) {
      const cityId = (region as { cityId?: string }).cityId;
      if (cityId) regionCity.set(region.id, cityId);
    }
  }
  const pairs = new Map<string, { from: string; to: string }>();
  for (const world of Object.values(CANONICAL_WORLDS) as unknown as AsciiWorldSpec[]) {
    for (const region of world.regions) {
      const fromCity = regionCity.get(region.id);
      if (!fromCity) continue;
      for (const target of region.connections) {
        const toCity = regionCity.get(target);
        if (!toCity || toCity === fromCity) continue;
        const key = [fromCity, toCity].sort().join("<->");
        if (!pairs.has(key)) pairs.set(key, { from: fromCity, to: toCity });
      }
    }
  }
  return [...pairs.values()];
}

function sharedTagLink(a: CitySummary, b: CitySummary): boolean {
  const tagsA = new Set(a.tags.map((t) => t.toLowerCase()));
  if (tagsA.size === 0) return false;
  if (a.region !== "Core Region" && a.region === b.region) return true;
  return b.tags.some((t) => tagsA.has(t.toLowerCase()));
}

/**
 * Builds the single unified world spec: one territory per city.
 * Pure + deterministic: same cities + links => same spec.
 */
export function buildKnowledgeWorldSpec(cities: CitySummary[], links: WorldLink[]): ParticleWorldSpec {
  const byId = new Map(cities.map((c) => [c.id, c]));
  const canonical = canonicalRegionsByCity();

  const regions: ParticleRegion[] = cities.map((city) => {
    const canon = canonical.get(city.id) || [];
    const concepts =
      canon.length > 0
        ? canon.flatMap((r) => [{ id: r.label, label: r.label, description: r.summary }]).slice(0, 6)
        : city.tags.slice(0, 6).map((t) => ({ id: t, label: t }));
    const summary =
      canon.length > 0
        ? canon.map((r) => r.label).join(" · ")
        : city.region !== "Core Region"
          ? city.region
          : `Knowledge territory for ${city.title}.`;
    return {
      id: city.id,
      label: city.title,
      summary,
      biome: biomeForCity(city.id),
      landmark: landmarkForCity(city.id),
      concepts,
      connections: [],
      cityId: city.id,
      position: cityPosition(city.id),
    };
  });

  // Connections: canonical cross-city links + explicit world links + shared tags.
  const edgeKeys = new Set<string>();
  const connect = (a: string, b: string) => {
    if (a === b || !byId.has(a) || !byId.has(b)) return;
    edgeKeys.add([a, b].sort().join("<->"));
  };
  for (const l of canonicalCityLinks()) connect(l.from, l.to);
  for (const l of links) connect(l.from, l.to);
  for (let i = 0; i < cities.length; i++) {
    for (let j = i + 1; j < cities.length; j++) {
      if (sharedTagLink(cities[i], cities[j])) connect(cities[i].id, cities[j].id);
    }
  }

  const adjacency = new Map<string, Set<string>>();
  for (const key of edgeKeys) {
    const [a, b] = key.split("<->");
    if (!adjacency.has(a)) adjacency.set(a, new Set());
    if (!adjacency.has(b)) adjacency.set(b, new Set());
    adjacency.get(a)!.add(b);
    adjacency.get(b)!.add(a);
  }
  for (const region of regions) {
    region.connections = [...(adjacency.get(region.id) || [])].sort();
  }

  return {
    id: KNOWLEDGE_WORLD_ID,
    title: "Polymax Cosmos",
    subject: "Unified knowledge world",
    seed: KNOWLEDGE_WORLD_SEED,
    description: "Every knowledge city as a territory in one explorable world.",
    regions,
  };
}

export async function fetchKnowledgeCities(): Promise<CitySummary[]> {
  const res = await fetch("/api/cities");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return (json.data || []) as CitySummary[];
}

export async function fetchWorldLinks(): Promise<WorldLink[]> {
  const res = await fetch("/api/world/links");
  if (!res.ok) return [];
  const json = await res.json();
  return (json.data || []) as WorldLink[];
}

/** Dev-only map tools (reset camera, reseed) gate. */
export function isDevMapTools(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (new URLSearchParams(window.location.search).has("dev")) return true;
    return window.localStorage.getItem("polymax-dev") === "1";
  } catch {
    return false;
  }
}

export interface MapCamera {
  x: number;
  y: number;
  zoom: number;
}

const cameraCache = new Map<string, MapCamera>();

export function getCachedCamera(key: string): MapCamera | undefined {
  return cameraCache.get(key);
}

export function setCachedCamera(key: string, camera: MapCamera): void {
  cameraCache.set(key, camera);
}
