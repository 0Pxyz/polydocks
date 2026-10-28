import type {
  CameraState,
  MapLayout,
  Point2D,
  StylePack,
} from "../types";
import {
  drawCompassRose,
  drawGalleonSilhouette,
  drawTerrainSprite,
} from "./terrainStamps";

export interface RenderOptions {
  hoveredCityId?: string | null;
  selectedCityId?: string | null;
  buildingProgress?: Record<string, number>;
}

/**
 * Transforms world coordinates to viewport screen coordinates based on camera pan and zoom.
 */
export function worldToScreen(
  pt: Point2D,
  camera: CameraState,
  vw: number,
  vh: number
): Point2D {
  return {
    x: (pt.x - camera.x) * camera.zoom + vw / 2,
    y: (pt.y - camera.y) * camera.zoom + vh / 2,
  };
}

/**
 * Transforms viewport screen coordinates to world coordinates.
 */
export function screenToWorld(
  pt: Point2D,
  camera: CameraState,
  vw: number,
  vh: number
): Point2D {
  return {
    x: (pt.x - vw / 2) / camera.zoom + camera.x,
    y: (pt.y - vh / 2) / camera.zoom + camera.y,
  };
}

/**
 * 60FPS Full-Screen Procedural Cartography Canvas Painter.
 * Renders all illustrated layers deterministically without external assets.
 */
export function renderWorld(
  ctx: CanvasRenderingContext2D,
  layout: MapLayout,
  camera: CameraState,
  stylePack: StylePack,
  vw: number,
  vh: number,
  options: RenderOptions = {}
) {
  const p = stylePack.palette;
  const zoom = camera.zoom;

  ctx.clearRect(0, 0, vw, vh);

  // 1. Ocean Base & Gradient
  const oceanGrad = ctx.createRadialGradient(vw / 2, vh / 2, 80, vw / 2, vh / 2, Math.max(vw, vh));
  oceanGrad.addColorStop(0, p.oceanShallow);
  oceanGrad.addColorStop(1, p.oceanDeep);
  ctx.fillStyle = oceanGrad;
  ctx.fillRect(0, 0, vw, vh);

  // 2. Cartographic Graticule (Lat/Long coordinate grid lines)
  ctx.save();
  ctx.strokeStyle = p.graticuleColor;
  ctx.lineWidth = 1;
  const gridSpacing = 200 * zoom;
  const offsetX = ((vw / 2 - camera.x * zoom) % gridSpacing + gridSpacing) % gridSpacing;
  const offsetY = ((vh / 2 - camera.y * zoom) % gridSpacing + gridSpacing) % gridSpacing;

  for (let x = offsetX; x < vw; x += gridSpacing) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, vh);
    ctx.stroke();
  }
  for (let y = offsetY; y < vh; y += gridSpacing) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(vw, y);
    ctx.stroke();
  }
  ctx.restore();

  // 3. Galleon / Sea Monster Silhouette in deep water
  const shipWorld: Point2D = { x: layout.bounds.minX + 160, y: layout.bounds.maxY - 140 };
  const shipScreen = worldToScreen(shipWorld, camera, vw, vh);
  if (shipScreen.x > -100 && shipScreen.x < vw + 100 && shipScreen.y > -100 && shipScreen.y < vh + 100) {
    drawGalleonSilhouette(ctx, shipScreen.x, shipScreen.y, Math.min(zoom * 0.9, 1.2), p);
  }

  // 4. Concentric Coastline Shallows & Landmasses
  // Shallows outer shelf (depth = 1)
  layout.coastlines
    .filter((c) => c.depth === 1)
    .forEach((coast) => {
      if (coast.polygon.length < 3) return;
      ctx.beginPath();
      const first = worldToScreen(coast.polygon[0], camera, vw, vh);
      ctx.moveTo(first.x, first.y);
      for (let i = 1; i < coast.polygon.length; i++) {
        const pt = worldToScreen(coast.polygon[i], camera, vw, vh);
        ctx.lineTo(pt.x, pt.y);
      }
      ctx.closePath();
      ctx.fillStyle = p.oceanBorder;
      ctx.fill();
    });

  // Main Landmass Base (depth = 0)
  layout.coastlines
    .filter((c) => c.depth === 0)
    .forEach((coast) => {
      if (coast.polygon.length < 3) return;
      ctx.beginPath();
      const first = worldToScreen(coast.polygon[0], camera, vw, vh);
      ctx.moveTo(first.x, first.y);
      for (let i = 1; i < coast.polygon.length; i++) {
        const pt = worldToScreen(coast.polygon[i], camera, vw, vh);
        ctx.lineTo(pt.x, pt.y);
      }
      ctx.closePath();
      ctx.fillStyle = p.landBase;
      ctx.fill();

      // Coastline Outer Glow / Foam stroke
      ctx.strokeStyle = p.coastlineGlow;
      ctx.lineWidth = Math.max(2 * zoom, 1.5);
      ctx.stroke();
    });

  // 5. Region Boundaries (Hand-drawn dashed lines)
  layout.regions.forEach((reg) => {
    if (reg.hull.length < 3) return;
    ctx.save();
    ctx.beginPath();
    const first = worldToScreen(reg.hull[0], camera, vw, vh);
    ctx.moveTo(first.x, first.y);
    for (let i = 1; i < reg.hull.length; i++) {
      const pt = worldToScreen(reg.hull[i], camera, vw, vh);
      ctx.lineTo(pt.x, pt.y);
    }
    ctx.closePath();

    ctx.setLineDash([8 * zoom, 6 * zoom]);
    ctx.strokeStyle = reg.color;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = Math.max(1.8 * zoom, 1);
    ctx.stroke();

    // Subtle region glow fill
    ctx.fillStyle = reg.accentColor;
    ctx.globalAlpha = 0.08;
    ctx.fill();
    ctx.restore();

    // Regional Title Banner (at Regional Zoom level)
    if (zoom < 1.35) {
      const regCenter = worldToScreen(reg.center, camera, vw, vh);
      ctx.save();
      ctx.font = `bold ${Math.round(Math.max(13, 16 * zoom))}px "Syne", sans-serif`;
      ctx.fillStyle = p.textPrimary;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.globalAlpha = 0.85;
      ctx.fillText(reg.title.toUpperCase(), regCenter.x, regCenter.y - reg.radius * 0.75 * zoom);
      ctx.restore();
    }
  });

  // 6. Rivers (Tapering stroke from interior to coast)
  layout.rivers.forEach((river) => {
    if (river.path.length < 2) return;
    ctx.save();
    ctx.strokeStyle = p.riverColor;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (let i = 0; i < river.path.length - 1; i++) {
      const p1 = worldToScreen(river.path[i], camera, vw, vh);
      const p2 = worldToScreen(river.path[i + 1], camera, vw, vh);
      const progress = i / river.path.length;
      const strokeW = Math.max((1.5 + progress * 2.5) * zoom, 1.2);

      ctx.beginPath();
      ctx.lineWidth = strokeW;
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
    ctx.restore();
  });

  // 7. Roads & Bridges
  layout.roads.forEach((road) => {
    if (road.points.length < 2) return;
    ctx.save();
    ctx.beginPath();
    const first = worldToScreen(road.points[0], camera, vw, vh);
    ctx.moveTo(first.x, first.y);
    for (let i = 1; i < road.points.length; i++) {
      const pt = worldToScreen(road.points[i], camera, vw, vh);
      ctx.lineTo(pt.x, pt.y);
    }

    if (road.kind === "bridge") {
      ctx.setLineDash([4 * zoom, 4 * zoom]);
      ctx.strokeStyle = p.coastlineGlow;
      ctx.lineWidth = Math.max(2.5 * zoom, 1.5);
    } else {
      ctx.setLineDash([5 * zoom, 5 * zoom]);
      ctx.strokeStyle = p.roadColor;
      ctx.lineWidth = Math.max(1.8 * zoom, 1);
    }
    ctx.stroke();
    ctx.restore();
  });

  // 8. Procedural Terrain Sprites (Mountains, Hills, Forests, Ruins)
  layout.terrainSprites.forEach((sprite) => {
    const sPos = worldToScreen({ x: sprite.x, y: sprite.y }, camera, vw, vh);
    // Viewport frustum culling
    if (sPos.x < -60 || sPos.x > vw + 60 || sPos.y < -60 || sPos.y > vh + 60) {
      return;
    }
    const scaledSprite = {
      ...sprite,
      x: sPos.x,
      y: sPos.y,
      scale: sprite.scale * Math.max(zoom, 0.6),
    };
    drawTerrainSprite(ctx, scaledSprite, p);
  });

  // 9. City Markers
  layout.cities.forEach((city) => {
    const cPos = worldToScreen(city.position, camera, vw, vh);
    // Viewport culling
    if (cPos.x < -80 || cPos.x > vw + 80 || cPos.y < -80 || cPos.y > vh + 80) {
      return;
    }

    const isHovered = options.hoveredCityId === city.id;
    const isSelected = options.selectedCityId === city.id;
    const region = layout.regions.find((r) => r.id === city.regionId);
    const accent = region?.color || p.textPrimary;
    const radius = Math.max((isHovered || isSelected ? 12 : 9) * zoom, 6);

    ctx.save();

    // A. Fog / Undiscovered State
    if (city.state === "undiscovered") {
      ctx.beginPath();
      ctx.arc(cPos.x, cPos.y, radius, 0, Math.PI * 2);
      ctx.strokeStyle = p.textMuted;
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = p.oceanBorder;
      ctx.fill();
    }
    // B. Building State (Active Progress Ring)
    else if (city.state === "building") {
      const progress = options.buildingProgress?.[city.id] ?? city.buildingProgress ?? 0.5;
      ctx.beginPath();
      ctx.arc(cPos.x, cPos.y, radius * 1.3, 0, Math.PI * 2);
      ctx.strokeStyle = p.oceanBorder;
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(
        cPos.x,
        cPos.y,
        radius * 1.3,
        -Math.PI / 2,
        -Math.PI / 2 + Math.PI * 2 * progress
      );
      ctx.strokeStyle = accent;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    // C. Discovered or Mastered State
    else {
      // Outer ripple if hovered or selected
      if (isHovered || isSelected) {
        ctx.beginPath();
        ctx.arc(cPos.x, cPos.y, radius * 1.8, 0, Math.PI * 2);
        ctx.strokeStyle = accent;
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.globalAlpha = 1.0;
      }

      // Outer ring
      ctx.beginPath();
      ctx.arc(cPos.x, cPos.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = p.landBase;
      ctx.fill();
      ctx.strokeStyle = accent;
      ctx.lineWidth = Math.max(2 * zoom, 1.8);
      ctx.stroke();

      // Inner jewel
      ctx.beginPath();
      ctx.arc(cPos.x, cPos.y, radius * 0.45, 0, Math.PI * 2);
      ctx.fillStyle = city.state === "mastered" ? "#FFC857" : accent;
      ctx.fill();
    }

    // City Name Banner & Level Badge
    ctx.font = `600 ${Math.round(Math.max(11, 13 * zoom))}px "Geist Mono", monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = isHovered ? accent : p.textPrimary;
    ctx.fillText(city.title, cPos.x, cPos.y + radius + 6);

    ctx.restore();
  });

  // 10. Illustrated Cartographic Accents
  // A. Compass Rose (pinned to bottom-left corner)
  drawCompassRose(ctx, 75, vh - 75, 42, p);

  // B. Cartographic Scale Bar (pinned to bottom-right corner)
  ctx.save();
  const scaleWorldUnits = 200;
  const scaleBarWidth = scaleWorldUnits * zoom;
  const scaleX = vw - Math.max(scaleBarWidth, 80) - 40;
  const scaleY = vh - 35;

  ctx.strokeStyle = p.textMuted;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(scaleX, scaleY);
  ctx.lineTo(scaleX + scaleBarWidth, scaleY);
  ctx.moveTo(scaleX, scaleY - 4);
  ctx.lineTo(scaleX, scaleY + 4);
  ctx.moveTo(scaleX + scaleBarWidth, scaleY - 4);
  ctx.lineTo(scaleX + scaleBarWidth, scaleY + 4);
  ctx.stroke();

  ctx.font = '10px "Geist Mono", monospace';
  ctx.fillStyle = p.textMuted;
  ctx.textAlign = "center";
  ctx.fillText(`${scaleWorldUnits} LY`, scaleX + scaleBarWidth / 2, scaleY - 7);
  ctx.restore();

  // C. Subtle Vignette
  const vignette = ctx.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.4, vw / 2, vh / 2, Math.max(vw, vh) * 0.8);
  vignette.addColorStop(0, "transparent");
  vignette.addColorStop(1, `rgba(0, 0, 0, ${p.vignetteIntensity})`);
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, vw, vh);
}
