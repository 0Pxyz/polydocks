/**
 * Procedural ASCII World Engine - Types & WorldSpec
 * Renderer-independent semantic world definition.
 */

export interface AsciiConcept {
  id: string;
  label: string;
  description?: string;
  status?: "locked" | "discovered" | "mastered";
}

export type AsciiBiome =
  | "plains"
  | "mountains"
  | "forest"
  | "caldera"
  | "desert"
  | "ocean"
  | "tundra";

export interface AsciiRegion {
  id: string;
  label: string;
  summary: string;
  biome: AsciiBiome;
  landmark: string; // Glyph or symbol (e.g., "▲", "✦", "🏛", "♠")
  concepts: string[] | AsciiConcept[];
  connections: string[]; // Connected region IDs
  cityId?: string; // Links to existing City Workspace (e.g., "neural-networks")
  position?: { x: number; y: number }; // Optional normalized anchor (0-1)
}

export interface AsciiWorldSpec {
  id: string;
  title: string;
  subject: string;
  seed: number;
  description: string;
  regions: AsciiRegion[];
  progression?: Record<string, "locked" | "discovered" | "mastered">;
}

export interface AsciiCell {
  char: string;
  color: string;
  backgroundColor?: string;
  regionId?: string;
  isPath?: boolean;
  isLandmark?: boolean;
  isLabel?: boolean;
  isBoundary?: boolean;
}

export interface AsciiGrid {
  width: number;
  height: number;
  cells: AsciiCell[][];
  regionCenters: Map<string, { x: number; y: number; region: AsciiRegion }>;
  seed: number;
}
