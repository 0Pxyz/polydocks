/**
 * Procedural Particle World Engine - Types & Specifications
 * Defines semantic knowledge structures, particle clusters, conduits, and engine states.
 */

export interface ParticleConcept {
  id: string;
  label: string;
  description?: string;
  status?: "locked" | "discovered" | "mastered";
}

export type ParticleBiome =
  | "plains"
  | "mountains"
  | "forest"
  | "caldera"
  | "desert"
  | "ocean"
  | "tundra";

export interface ParticleRegion {
  id: string;
  label: string;
  summary: string;
  biome: ParticleBiome;
  landmark: string; // Glyph or symbol (e.g., "◬", "▲", "◈", "✦", "⚖", "🏛", "♠")
  concepts: string[] | ParticleConcept[];
  connections: string[]; // Connected region IDs
  cityId?: string; // Links to existing City Workspace (e.g., "neural-networks")
  position?: { x: number; y: number }; // Normalized anchor coordinates (0-1)
}

export interface ParticleWorldSpec {
  id: string;
  title: string;
  subject: string;
  seed: number;
  description: string;
  regions: ParticleRegion[];
  progression?: Record<string, "locked" | "discovered" | "mastered">;
}

export interface Particle {
  id: number;
  x: number;
  y: number;
  baseX: number;
  baseY: number;
  baseRadius: number;
  currentRadius: number;
  color: string;
  alpha: number;
  baseAlpha: number;
  regionId?: string;
  isLandmark?: boolean;
  isPath?: boolean;
  pathProgress?: number;
  pathSpeed?: number;
  pathId?: string;
  phase: number;
  speed: number;
  orbitRadius?: number;
  orbitAngle?: number;
  orbitSpeed?: number;
}

export interface PathConduit {
  id: string;
  fromRegionId: string;
  toRegionId: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  controlPoint1: { x: number; y: number };
  controlPoint2: { x: number; y: number };
  length: number;
  color: string;
  particles: Particle[];
}

export interface TerritoryCluster {
  id: string;
  label: string;
  summary: string;
  landmark: string;
  color: string;
  accentColor: string;
  center: { x: number; y: number };
  radius: number;
  particles: Particle[];
  boundaryPoints: { x: number; y: number }[];
  concepts: ParticleConcept[];
  region: ParticleRegion;
  status: "locked" | "discovered" | "mastered";
}

export interface ParticleWorld {
  spec: ParticleWorldSpec;
  seed: number;
  width: number;
  height: number;
  territories: Map<string, TerritoryCluster>;
  allParticles: Particle[];
  conduits: PathConduit[];
  ambientParticles: Particle[];
}

export interface ParticleEngineOptions {
  width?: number;
  height?: number;
  customSeed?: number;
  particlesPerTerritory?: number;
  ambientDensity?: number;
}
