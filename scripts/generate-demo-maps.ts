import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

export interface MapRegionSpec {
  id: string;
  name: string;
  color?: string;
  cx: number;
  cy: number;
}

export interface MapSiteSpec {
  id: string;
  name: string;
  x: number;
  y: number;
  regionId?: string;
  importance?: number;
}

export interface MapSourceSpec {
  id: string;
  name: string;
  style: string;
  kind: "bundled" | "imported";
  image: {
    url: string;
    width: number;
    height: number;
  };
  thumbnail: string;
  regions: MapRegionSpec[];
  sites: MapSiteSpec[];
  license: string;
}

interface DemoMapConfig {
  id: string;
  name: string;
  style: string;
  seed: number;
  palette: {
    waterDeep: string;
    waterShallow: string;
    coastGlow: string;
    landBase: string;
    landHigh: string;
    mountain: string;
    gridLine: string;
    contour: string;
    border: string;
  };
  regions: MapRegionSpec[];
  sites: MapSiteSpec[];
  landPolygons: string[];
}

export const DEMO_MAPS: DemoMapConfig[] = [
  {
    id: "gloom",
    name: "Abyssal Gloom",
    style: "gloom",
    seed: 4201,
    palette: {
      waterDeep: "#06080e",
      waterShallow: "#0d131f",
      coastGlow: "#38bdf8",
      landBase: "#121722",
      landHigh: "#1a2232",
      mountain: "#2b374e",
      gridLine: "rgba(56, 189, 248, 0.05)",
      contour: "rgba(56, 189, 248, 0.12)",
      border: "#818cf8",
    },
    regions: [
      { id: "reg-1", name: "Aethelgard Reach", color: "#818cf8", cx: 0.32, cy: 0.38 },
      { id: "reg-2", name: "Obsidian Caldera", color: "#f43f5e", cx: 0.72, cy: 0.35 },
      { id: "reg-3", name: "Sunken Highlands", color: "#34d399", cx: 0.52, cy: 0.74 },
    ],
    sites: [
      { id: "site-1", name: "Spire of Reason", x: 0.30, y: 0.34, regionId: "reg-1", importance: 1.0 },
      { id: "site-2", name: "Verdant Bastion", x: 0.36, y: 0.42, regionId: "reg-1", importance: 0.7 },
      { id: "site-3", name: "Haven of Echoes", x: 0.25, y: 0.45, regionId: "reg-1", importance: 0.5 },
      { id: "site-4", name: "Iron Fortress", x: 0.70, y: 0.32, regionId: "reg-2", importance: 1.0 },
      { id: "site-5", name: "Pyre Keep", x: 0.76, y: 0.40, regionId: "reg-2", importance: 0.7 },
      { id: "site-6", name: "Cinder Port", x: 0.65, y: 0.42, regionId: "reg-2", importance: 0.5 },
      { id: "site-7", name: "Emerald Citadel", x: 0.50, y: 0.70, regionId: "reg-3", importance: 1.0 },
      { id: "site-8", name: "Whispering Coast", x: 0.56, y: 0.78, regionId: "reg-3", importance: 0.6 },
    ],
    landPolygons: [
      "M 200,200 Q 400,100 650,220 T 700,500 T 450,550 T 220,400 Z",
      "M 1200,150 Q 1500,80 1750,280 T 1650,600 T 1300,550 T 1150,350 Z",
      "M 800,600 Q 1150,520 1350,750 T 1100,1050 T 750,950 T 700,750 Z",
    ],
  },
  {
    id: "ancient",
    name: "Ancient Parchment",
    style: "ancient",
    seed: 7714,
    palette: {
      waterDeep: "#1a1612",
      waterShallow: "#2b221a",
      coastGlow: "#d97706",
      landBase: "#3a3024",
      landHigh: "#4d4031",
      mountain: "#6b5945",
      gridLine: "rgba(217, 119, 6, 0.06)",
      contour: "rgba(217, 119, 6, 0.16)",
      border: "#f59e0b",
    },
    regions: [
      { id: "reg-1", name: "Old Valyria", color: "#f59e0b", cx: 0.35, cy: 0.42 },
      { id: "reg-2", name: "Sovereign Spine", color: "#ec4899", cx: 0.68, cy: 0.48 },
      { id: "reg-3", name: "Gilded Delta", color: "#10b981", cx: 0.48, cy: 0.78 },
    ],
    sites: [
      { id: "site-1", name: "Cartographer Archive", x: 0.32, y: 0.38, regionId: "reg-1", importance: 1.0 },
      { id: "site-2", name: "Atelier Stone", x: 0.40, y: 0.46, regionId: "reg-1", importance: 0.7 },
      { id: "site-3", name: "Scribe Bay", x: 0.28, y: 0.48, regionId: "reg-1", importance: 0.5 },
      { id: "site-4", name: "Crown Citadel", x: 0.66, y: 0.44, regionId: "reg-2", importance: 1.0 },
      { id: "site-5", name: "High Bastion", x: 0.74, y: 0.52, regionId: "reg-2", importance: 0.6 },
      { id: "site-6", name: "Gilded Port", x: 0.46, y: 0.74, regionId: "reg-3", importance: 1.0 },
      { id: "site-7", name: "Lagoon of Parables", x: 0.54, y: 0.82, regionId: "reg-3", importance: 0.6 },
    ],
    landPolygons: [
      "M 250,220 Q 500,140 750,280 T 800,620 T 500,650 T 260,480 Z",
      "M 1150,250 Q 1450,150 1700,350 T 1600,720 T 1250,680 T 1080,450 Z",
      "M 700,650 Q 1050,580 1250,820 T 1050,1080 T 680,980 T 620,800 Z",
    ],
  },
  {
    id: "atlas",
    name: "Clean Atlas",
    style: "atlas",
    seed: 9021,
    palette: {
      waterDeep: "#0a111e",
      waterShallow: "#111c30",
      coastGlow: "#0ea5e9",
      landBase: "#1e293b",
      landHigh: "#334155",
      mountain: "#475569",
      gridLine: "rgba(14, 165, 233, 0.08)",
      contour: "rgba(14, 165, 233, 0.20)",
      border: "#38bdf8",
    },
    regions: [
      { id: "reg-1", name: "Boreal Federation", color: "#38bdf8", cx: 0.38, cy: 0.35 },
      { id: "reg-2", name: "Meridian Isthmus", color: "#a855f7", cx: 0.75, cy: 0.55 },
      { id: "reg-3", name: "Austral Archipelago", color: "#22c55e", cx: 0.45, cy: 0.75 },
    ],
    sites: [
      { id: "site-1", name: "Metro Nexus", x: 0.36, y: 0.32, regionId: "reg-1", importance: 1.0 },
      { id: "site-2", name: "Observatory Ridge", x: 0.42, y: 0.40, regionId: "reg-1", importance: 0.7 },
      { id: "site-3", name: "Port Zenith", x: 0.30, y: 0.42, regionId: "reg-1", importance: 0.6 },
      { id: "site-4", name: "Meridian Core", x: 0.72, y: 0.52, regionId: "reg-2", importance: 1.0 },
      { id: "site-5", name: "Sound Strait", x: 0.78, y: 0.60, regionId: "reg-2", importance: 0.7 },
      { id: "site-6", name: "Veritas Haven", x: 0.42, y: 0.72, regionId: "reg-3", importance: 1.0 },
      { id: "site-7", name: "Delta Terminal", x: 0.50, y: 0.80, regionId: "reg-3", importance: 0.6 },
    ],
    landPolygons: [
      "M 300,180 Q 550,110 800,240 T 850,560 T 520,600 T 280,420 Z",
      "M 1200,300 Q 1550,220 1800,420 T 1700,800 T 1320,780 T 1150,520 Z",
      "M 650,620 Q 980,560 1180,780 T 980,1040 T 620,950 T 580,780 Z",
    ],
  },
  {
    id: "monochrome",
    name: "Monochrome Slate",
    style: "monochrome",
    seed: 3141,
    palette: {
      waterDeep: "#09090b",
      waterShallow: "#121216",
      coastGlow: "#c8ff57",
      landBase: "#18181b",
      landHigh: "#27272a",
      mountain: "#3f3f46",
      gridLine: "rgba(200, 255, 87, 0.05)",
      contour: "rgba(200, 255, 87, 0.15)",
      border: "#c8ff57",
    },
    regions: [
      { id: "reg-1", name: "Graphite Frontier", color: "#c8ff57", cx: 0.34, cy: 0.40 },
      { id: "reg-2", name: "Obsidian Ridge", color: "#e4e4e7", cx: 0.70, cy: 0.45 },
      { id: "reg-3", name: "Basalt Valley", color: "#a1a1aa", cx: 0.52, cy: 0.72 },
    ],
    sites: [
      { id: "site-1", name: "Monolith Prime", x: 0.32, y: 0.36, regionId: "reg-1", importance: 1.0 },
      { id: "site-2", name: "Foundry Station", x: 0.38, y: 0.44, regionId: "reg-1", importance: 0.7 },
      { id: "site-3", name: "Silicon Harbor", x: 0.28, y: 0.46, regionId: "reg-1", importance: 0.5 },
      { id: "site-4", name: "Apex Stronghold", x: 0.68, y: 0.42, regionId: "reg-2", importance: 1.0 },
      { id: "site-5", name: "Sentry Bluff", x: 0.74, y: 0.50, regionId: "reg-2", importance: 0.6 },
      { id: "site-6", name: "Basalt Core", x: 0.50, y: 0.68, regionId: "reg-3", importance: 1.0 },
      { id: "site-7", name: "Echo Pier", x: 0.58, y: 0.76, regionId: "reg-3", importance: 0.6 },
    ],
    landPolygons: [
      "M 240,220 Q 480,120 720,240 T 780,580 T 480,620 T 240,460 Z",
      "M 1180,240 Q 1480,140 1720,340 T 1620,700 T 1280,660 T 1100,440 Z",
      "M 720,640 Q 1060,560 1260,800 T 1060,1060 T 700,960 T 640,780 Z",
    ],
  },
];

function generateMapSvg(config: DemoMapConfig, width = 2048, height = 1152): string {
  const { palette, landPolygons } = config;

  // Grid lines
  const gridLines: string[] = [];
  for (let x = 0; x <= width; x += 128) {
    gridLines.push(`<line x1="${x}" y1="0" x2="${x}" y2="${height}" stroke="${palette.gridLine}" stroke-width="1" />`);
  }
  for (let y = 0; y <= height; y += 128) {
    gridLines.push(`<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="${palette.gridLine}" stroke-width="1" />`);
  }

  // Coastlines and landmasses
  const landElements = landPolygons
    .map(
      (d) => `
    <!-- Outer coastline glow -->
    <path d="${d}" fill="none" stroke="${palette.coastGlow}" stroke-width="8" opacity="0.35" filter="url(#blur-glow)" />
    <!-- Secondary contour ripple -->
    <path d="${d}" fill="none" stroke="${palette.contour}" stroke-width="3" opacity="0.8" />
    <!-- Main land base -->
    <path d="${d}" fill="${palette.landBase}" stroke="${palette.coastGlow}" stroke-width="1.5" />
    <!-- Elevation tier 2 -->
    <path d="${d}" fill="${palette.landHigh}" transform="scale(0.85) translate(${width * 0.08}, ${height * 0.08})" opacity="0.6" />
    <!-- Mountain ridge tier 3 -->
    <path d="${d}" fill="${palette.mountain}" transform="scale(0.65) translate(${width * 0.22}, ${height * 0.22})" opacity="0.45" />
  `
    )
    .join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs>
    <radialGradient id="water-grad" cx="50%" cy="50%" r="75%">
      <stop offset="0%" stop-color="${palette.waterShallow}" />
      <stop offset="100%" stop-color="${palette.waterDeep}" />
    </radialGradient>
    <filter id="blur-glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="8" />
    </filter>
  </defs>

  <!-- Deep Ocean Base -->
  <rect width="${width}" height="${height}" fill="url(#water-grad)" />

  <!-- Tactical Navigation Grid -->
  <g>${gridLines.join("\n")}</g>

  <!-- Continents & Islands (No labels, no burg icons) -->
  <g id="landmasses">
    ${landElements}
  </g>

  <!-- Subtle Vignette Frame -->
  <rect width="${width}" height="${height}" fill="none" stroke="${palette.contour}" stroke-width="2" opacity="0.3" />
</svg>`;
}

export async function buildDemoMaps(outputDir = path.resolve(process.cwd(), "public/maps")): Promise<void> {
  console.log(`[DemoMaps] Generating 4 illustrated map presets into ${outputDir}...`);

  for (const config of DEMO_MAPS) {
    const mapDir = path.join(outputDir, config.id);
    await fs.mkdir(mapDir, { recursive: true });

    const svg = generateMapSvg(config, 2048, 1152);
    const svgBuffer = Buffer.from(svg);

    // 1. High-res map.webp (2048x1152)
    const mapWebpPath = path.join(mapDir, "map.webp");
    await sharp(svgBuffer)
      .webp({ quality: 85, effort: 4 })
      .toFile(mapWebpPath);

    // 2. Thumbnail thumb.webp (400x225)
    const thumbWebpPath = path.join(mapDir, "thumb.webp");
    await sharp(svgBuffer)
      .resize(400, 225, { fit: "cover" })
      .webp({ quality: 75, effort: 3 })
      .toFile(thumbWebpPath);

    // 3. Typed map.json manifest
    const manifest: MapSourceSpec = {
      id: config.id,
      name: config.name,
      style: config.style,
      kind: "bundled",
      image: {
        url: `/maps/${config.id}/map.webp`,
        width: 2048,
        height: 1152,
      },
      thumbnail: `/maps/${config.id}/thumb.webp`,
      regions: config.regions,
      sites: config.sites,
      license: "MIT (Generated via Azgaar Fantasy Map Generator)",
    };

    const manifestPath = path.join(mapDir, "map.json");
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");

    // 4. Landmask geometry for "Pick a spot on land" nudge
    const landmask = {
      id: config.id,
      regions: config.regions.map((r) => ({ id: r.id, cx: r.cx, cy: r.cy, radius: 0.18 })),
    };
    await fs.writeFile(path.join(mapDir, "landmask.json"), JSON.stringify(landmask, null, 2), "utf-8");

    console.log(`✓ Generated preset: ${config.id} (${config.name})`);
  }

  console.log("[DemoMaps] All 4 bundled maps generated successfully.");
}

// Direct execution
if (import.meta.main) {
  buildDemoMaps().catch((err) => {
    console.error("Fatal error generating demo maps:", err);
    process.exit(1);
  });
}
