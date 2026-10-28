import type { StylePack, TerrainSprite } from "../types";

/**
 * Procedural Vector Cartography Stamp Generators.
 * Pure code rendering without external image dependencies or copyrighted art.
 */

export function drawMountain(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  palette: StylePack["palette"]
) {
  const w = 28 * scale;
  const h = 24 * scale;

  ctx.save();
  ctx.translate(x, y);

  // Left lighted face
  ctx.beginPath();
  ctx.moveTo(0, -h);
  ctx.lineTo(-w / 2, h / 2);
  ctx.lineTo(0, h / 2);
  ctx.closePath();
  ctx.fillStyle = palette.landHighlight;
  ctx.fill();
  ctx.strokeStyle = palette.oceanBorder;
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // Right shaded face
  ctx.beginPath();
  ctx.moveTo(0, -h);
  ctx.lineTo(0, h / 2);
  ctx.lineTo(w / 2, h / 2);
  ctx.closePath();
  ctx.fillStyle = palette.hillshade;
  ctx.fill();
  ctx.strokeStyle = palette.oceanBorder;
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // Ridge line
  ctx.beginPath();
  ctx.moveTo(0, -h);
  ctx.lineTo(w * 0.05, h * 0.1);
  ctx.lineTo(0, h / 2);
  ctx.strokeStyle = palette.coastlineGlow;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.restore();
}

export function drawHill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  palette: StylePack["palette"]
) {
  const r = 14 * scale;

  ctx.save();
  ctx.translate(x, y);

  ctx.beginPath();
  ctx.arc(0, 0, r, Math.PI, 0, false);
  ctx.fillStyle = palette.landHighlight;
  ctx.fill();
  ctx.strokeStyle = palette.oceanBorder;
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // Shading hatch
  ctx.beginPath();
  ctx.arc(r * 0.2, 0, r * 0.8, Math.PI, 0, false);
  ctx.fillStyle = palette.hillshade;
  ctx.fill();

  ctx.restore();
}

export function drawForest(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  palette: StylePack["palette"]
) {
  const r = 7 * scale;

  ctx.save();
  ctx.translate(x, y);

  // Cluster of 3 canopy puffs
  const offsets = [
    { dx: -r * 0.7, dy: 0 },
    { dx: r * 0.7, dy: 0 },
    { dx: 0, dy: -r * 0.8 },
  ];

  ctx.fillStyle = palette.landHighlight;
  ctx.strokeStyle = palette.oceanBorder;
  ctx.lineWidth = 1;

  offsets.forEach(({ dx, dy }) => {
    ctx.beginPath();
    ctx.arc(dx, dy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });

  ctx.restore();
}

export function drawRuins(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  palette: StylePack["palette"]
) {
  const size = 12 * scale;

  ctx.save();
  ctx.translate(x, y);

  // Two ancient pillars with lintel
  ctx.fillStyle = palette.textMuted;
  ctx.fillRect(-size * 0.6, -size * 0.5, size * 0.3, size);
  ctx.fillRect(size * 0.3, -size * 0.2, size * 0.3, size * 0.7);
  // Fallen lintel stone
  ctx.fillRect(-size * 0.8, -size * 0.8, size * 1.5, size * 0.3);

  ctx.restore();
}

export function drawTerrainSprite(
  ctx: CanvasRenderingContext2D,
  sprite: TerrainSprite,
  palette: StylePack["palette"]
) {
  switch (sprite.kind) {
    case "mountain":
      drawMountain(ctx, sprite.x, sprite.y, sprite.scale, palette);
      break;
    case "hill":
      drawHill(ctx, sprite.x, sprite.y, sprite.scale, palette);
      break;
    case "forest":
      drawForest(ctx, sprite.x, sprite.y, sprite.scale, palette);
      break;
    case "ruins":
      drawRuins(ctx, sprite.x, sprite.y, sprite.scale, palette);
      break;
  }
}

/**
 * Draws an authentic cartographic Compass Rose with 8 cardinal / ordinal points.
 */
export function drawCompassRose(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  palette: StylePack["palette"]
) {
  ctx.save();
  ctx.translate(cx, cy);

  // Outer decorative ring
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.strokeStyle = palette.oceanBorder;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Inner ring
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.65, 0, Math.PI * 2);
  ctx.strokeStyle = palette.graticuleColor;
  ctx.lineWidth = 1;
  ctx.stroke();

  // 4 Cardinal points (North, South, East, West)
  const cardinalAngles = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];
  cardinalAngles.forEach((angle) => {
    ctx.save();
    ctx.rotate(angle);

    // Light half
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -radius * 1.15);
    ctx.lineTo(radius * 0.16, 0);
    ctx.closePath();
    ctx.fillStyle = palette.textPrimary;
    ctx.fill();

    // Dark half
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -radius * 1.15);
    ctx.lineTo(-radius * 0.16, 0);
    ctx.closePath();
    ctx.fillStyle = palette.oceanBorder;
    ctx.fill();

    ctx.restore();
  });

  // 4 Ordinal points (NE, SE, SW, NW)
  const ordinalAngles = [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4];
  ordinalAngles.forEach((angle) => {
    ctx.save();
    ctx.rotate(angle);

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -radius * 0.75);
    ctx.lineTo(radius * 0.1, 0);
    ctx.closePath();
    ctx.fillStyle = palette.coastlineGlow;
    ctx.fill();

    ctx.restore();
  });

  // North Indicator Letter "N"
  ctx.fillStyle = palette.textPrimary;
  ctx.font = "bold 11px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText("N", 0, -radius * 1.25);

  ctx.restore();
}

/**
 * Draws a subtle illustrated galleon / sea vessel silhouette in deep ocean waters.
 */
export function drawGalleonSilhouette(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  palette: StylePack["palette"]
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  ctx.strokeStyle = palette.oceanBorder;
  ctx.fillStyle = palette.oceanBorder;
  ctx.lineWidth = 1.2;

  // Ship hull
  ctx.beginPath();
  ctx.moveTo(-20, 5);
  ctx.quadraticCurveTo(-15, 12, 0, 12);
  ctx.quadraticCurveTo(15, 12, 22, 4);
  ctx.lineTo(18, 0);
  ctx.lineTo(-18, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Masts & square sails
  ctx.beginPath();
  // Main mast
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -22);
  // Fore mast
  ctx.moveTo(-10, 0);
  ctx.lineTo(-10, -17);
  // Mizzen mast
  ctx.moveTo(10, 0);
  ctx.lineTo(10, -15);
  ctx.stroke();

  // Sails
  ctx.fillStyle = palette.graticuleColor;
  ctx.beginPath();
  ctx.arc(0, -12, 6, Math.PI * 0.8, Math.PI * 0.2, true);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-10, -9, 5, Math.PI * 0.8, Math.PI * 0.2, true);
  ctx.fill();

  ctx.restore();
}
