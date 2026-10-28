import type { AsciiWorldSpec, AsciiGrid, AsciiCell, AsciiRegion, AsciiBiome } from "./types";

/**
 * Deterministic PRNG: Mulberry32
 */
export function createRng(seed: number) {
  let s = Math.floor(seed) >>> 0;
  return function next(): number {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Simple 2D multi-octave deterministic value noise using trig harmonics.
 */
function terrainNoise(x: number, y: number, seed: number): number {
  const s = (seed % 10000) / 1000;
  const n1 = Math.sin(x * 0.08 + s) * Math.cos(y * 0.08 + s * 1.5);
  const n2 = Math.sin(x * 0.16 - s * 0.8) * Math.cos(y * 0.14 + s * 0.4) * 0.5;
  const n3 = Math.sin(x * 0.32 + s * 2.1) * Math.cos(y * 0.28 - s * 1.2) * 0.25;
  return (n1 + n2 + n3 + 1.75) / 3.5; // Normalized 0..1
}

const BIOME_CHARS: Record<AsciiBiome, string[]> = {
  ocean: ["~", "≈", "·", " "],
  plains: [".", ",", "'", "\""],
  forest: ["♣", "♠", "↑", "‡", "Y"],
  mountains: ["▲", "^", "∧", "/\\"],
  caldera: ["*", "✦", "░", "~"],
  desert: ["~", "°", "·", "≈"],
  tundra: ["*", "·", "-", "°"],
};

const BIOME_COLORS: Record<AsciiBiome, { primary: string; secondary: string; dim: string }> = {
  ocean: { primary: "#0284c7", secondary: "#0369a1", dim: "#082f49" },
  plains: { primary: "#22c55e", secondary: "#16a34a", dim: "#14532d" },
  forest: { primary: "#4ade80", secondary: "#15803d", dim: "#052e16" },
  mountains: { primary: "#cbd5e1", secondary: "#94a3b8", dim: "#475569" },
  caldera: { primary: "#fb923c", secondary: "#ea580c", dim: "#7c2d12" },
  desert: { primary: "#facc15", secondary: "#ca8a04", dim: "#713f12" },
  tundra: { primary: "#38bdf8", secondary: "#0284c7", dim: "#1e3a8a" },
};

/**
 * Generates an ASCII grid from a WorldSpec and deterministic seed.
 */
export function generateAsciiWorld(
  world: AsciiWorldSpec,
  options: { width?: number; height?: number; customSeed?: number } = {}
): AsciiGrid {
  const width = options.width || 120;
  const height = options.height || 60;
  const seed = options.customSeed !== undefined ? options.customSeed : world.seed;
  const rng = createRng(seed);

  // Initialize cells
  const cells: AsciiCell[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({
      char: " ",
      color: "#082f49",
    }))
  );

  // 1. Calculate and anchor region centers
  const regionCenters = new Map<string, { x: number; y: number; region: AsciiRegion }>();
  world.regions.forEach((region, idx) => {
    let rx: number;
    let ry: number;

    if (region.position) {
      rx = Math.floor(region.position.x * (width - 24)) + 12;
      ry = Math.floor(region.position.y * (height - 18)) + 9;
    } else {
      // Deterministic layout with angular spacing
      const angle = (idx / world.regions.length) * Math.PI * 2 + (rng() - 0.5) * 0.4;
      const radiusX = (width / 2.6) * (0.6 + rng() * 0.3);
      const radiusY = (height / 2.6) * (0.6 + rng() * 0.3);
      rx = Math.floor(width / 2 + Math.cos(angle) * radiusX);
      ry = Math.floor(height / 2 + Math.sin(angle) * radiusY);
    }

    rx = Math.max(12, Math.min(width - 16, rx));
    ry = Math.max(8, Math.min(height - 10, ry));

    regionCenters.set(region.id, { x: rx, y: ry, region });
  });

  // 2. Terrain & Biome Generation
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const elevation = terrainNoise(x, y, seed);

      // Find nearest region for territorial clustering
      let minDist = Infinity;
      let nearestRegion: AsciiRegion = world.regions[0];

      regionCenters.forEach(({ x: cx, y: cy, region }) => {
        // Weighted distance metric
        const dx = (x - cx) * 1.0;
        const dy = (y - cy) * 1.8; // Aspect ratio adjustment
        const dist = Math.hypot(dx, dy);
        if (dist < minDist) {
          minDist = dist;
          nearestRegion = region;
        }
      });

      const biome = elevation < 0.28 ? "ocean" : nearestRegion.biome;
      const chars = BIOME_CHARS[biome];
      const colors = BIOME_COLORS[biome];

      const charIdx = Math.floor(terrainNoise(x * 2.5, y * 2.5, seed + 99) * chars.length) % chars.length;
      const char = chars[charIdx];

      // Assign subtle color shade
      const shade = terrainNoise(x * 4, y * 4, seed + 123);
      const color = shade > 0.65 ? colors.primary : shade > 0.35 ? colors.secondary : colors.dim;

      cells[y][x] = {
        char,
        color,
        regionId: biome !== "ocean" ? nearestRegion.id : undefined,
      };
    }
  }

  // 3. Carve Roads between Connected Regions
  world.regions.forEach((region) => {
    const fromCenter = regionCenters.get(region.id);
    if (!fromCenter) return;

    (region.connections || []).forEach((targetId) => {
      const toCenter = regionCenters.get(targetId);
      if (!toCenter) return;

      // Draw road using Bresenham with slight wander
      let x0 = fromCenter.x;
      let y0 = fromCenter.y;
      const x1 = toCenter.x;
      const y1 = toCenter.y;

      const dx = Math.abs(x1 - x0);
      const dy = Math.abs(y1 - y0);
      const sx = x0 < x1 ? 1 : -1;
      const sy = y0 < y1 ? 1 : -1;
      let err = dx - dy;

      while (true) {
        if (x0 >= 0 && x0 < width && y0 >= 0 && y0 < height) {
          // If not currently a label or landmark, stamp road character
          const existing = cells[y0][x0];
          if (!existing.isLabel && !existing.isLandmark) {
            const roadChar = (x0 + y0) % 2 === 0 ? "═" : "·";
            cells[y0][x0] = {
              char: roadChar,
              color: "#fde047", // amber-yellow road
              isPath: true,
              regionId: existing.regionId,
            };
          }
        }

        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 > -dy) {
          err -= dy;
          x0 += sx;
        }
        if (e2 < dx) {
          err += dx;
          y0 += sy;
        }
      }
    });
  });

  // 4. Stamp Region Settlement Plaques and Landmarks
  regionCenters.forEach(({ x: cx, y: cy, region }) => {
    const label = region.label.toUpperCase();
    const landmark = region.landmark || "✦";
    const status = world.progression?.[region.id] || "discovered";

    const badgeColor =
      status === "mastered"
        ? "#C8FF57" // accent lime
        : status === "discovered"
        ? "#38bdf8" // sky blue
        : "#94a3b8"; // locked muted

    // Header border with landmark: ┌─ ◬ ──────────────┐
    const plaqueWidth = Math.max(label.length + 6, 16);
    const halfWidth = Math.floor(plaqueWidth / 2);
    const startX = Math.max(1, Math.min(width - plaqueWidth - 2, cx - halfWidth));
    const startY = Math.max(1, Math.min(height - 5, cy - 1));

    // Top line
    for (let c = 0; c < plaqueWidth; c++) {
      const gx = startX + c;
      if (gx >= 0 && gx < width && startY >= 0 && startY < height) {
        let ch = "─";
        let col = badgeColor;
        if (c === 0) ch = "┌";
        else if (c === plaqueWidth - 1) ch = "┐";
        else if (c === 3) {
          ch = landmark;
          col = "#C8FF57";
        }

        cells[startY][gx] = {
          char: ch,
          color: col,
          backgroundColor: "#0d1117",
          regionId: region.id,
          isLandmark: c === 3,
          isLabel: true,
        };
      }
    }

    // Middle text line: │  PERCEPTRONS     │
    const textY = startY + 1;
    if (textY < height) {
      for (let c = 0; c < plaqueWidth; c++) {
        const gx = startX + c;
        if (gx >= 0 && gx < width) {
          let ch = " ";
          let col = "#f8fafc";
          if (c === 0 || c === plaqueWidth - 1) {
            ch = "│";
            col = badgeColor;
          } else {
            const textOffset = c - 3;
            if (textOffset >= 0 && textOffset < label.length) {
              ch = label[textOffset];
            }
          }

          cells[textY][gx] = {
            char: ch,
            color: col,
            backgroundColor: "#0d1117",
            regionId: region.id,
            isLabel: true,
          };
        }
      }
    }

    // Bottom line: └──────────────────┘
    const botY = startY + 2;
    if (botY < height) {
      for (let c = 0; c < plaqueWidth; c++) {
        const gx = startX + c;
        if (gx >= 0 && gx < width) {
          let ch = "─";
          if (c === 0) ch = "└";
          else if (c === plaqueWidth - 1) ch = "┘";

          cells[botY][gx] = {
            char: ch,
            color: badgeColor,
            backgroundColor: "#0d1117",
            regionId: region.id,
            isLabel: true,
          };
        }
      }
    }
  });

  return {
    width,
    height,
    cells,
    regionCenters,
    seed,
  };
}
