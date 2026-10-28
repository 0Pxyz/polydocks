import { Hono } from "hono";
import path from "node:path";
import fs from "node:fs/promises";
import sharp from "sharp";
import { BUNDLED_MAPS } from "../../src/features/world/bundledMaps";
import { db } from "../workspace/db";
import type { CityPoint, MapSource } from "../../src/features/world/types";

export const mapsRouter = new Hono();

const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), "workspace/data");

// GET /api/maps - list all bundled and imported maps
mapsRouter.get("/", async (c) => {
  let importedMaps: MapSource[] = [];
  try {
    const rows = db.query("SELECT * FROM maps ORDER BY created_at DESC").all() as any[];
    if (rows && rows.length > 0) {
      importedMaps = rows.map((r) => ({
        id: r.id,
        name: r.name,
        style: r.style,
        kind: r.kind as "imported",
        image: {
          url: r.image_url,
          width: r.image_width,
          height: r.image_height,
        },
        thumbnail: r.thumbnail_url,
        regions: r.regions_json ? JSON.parse(r.regions_json) : undefined,
        sites: r.sites_json ? JSON.parse(r.sites_json) : undefined,
        license: r.license || "User Upload",
      }));
    }
  } catch {
    // Database fallback
  }

  return c.json({
    maps: [...BUNDLED_MAPS, ...importedMaps],
  });
});

// GET /api/maps/:id - retrieve map manifest
mapsRouter.get("/:id", async (c) => {
  const id = c.req.param("id").toLowerCase();
  const bundled = BUNDLED_MAPS.find((m) => m.id === id);
  if (bundled) {
    return c.json(bundled);
  }

  try {
    const row = db.query("SELECT * FROM maps WHERE id = ?").get(id) as any;
    if (row) {
      const mapSource: MapSource = {
        id: row.id,
        name: row.name,
        style: row.style,
        kind: row.kind,
        image: {
          url: row.image_url,
          width: row.image_width,
          height: row.image_height,
        },
        thumbnail: row.thumbnail_url,
        regions: row.regions_json ? JSON.parse(row.regions_json) : undefined,
        sites: row.sites_json ? JSON.parse(row.sites_json) : undefined,
        license: row.license || "User Upload",
      };
      return c.json(mapSource);
    }
  } catch {
    // Database fallback
  }

  return c.json({ error: `Map '${id}' not found` }, 404);
});

// GET /api/maps/:id/points - retrieve points on this map
mapsRouter.get("/:id/points", async (c) => {
  const mapId = c.req.param("id").toLowerCase();
  try {
    const rows = db.query("SELECT * FROM map_points WHERE map_id = ?").all(mapId) as any[];
    const points: CityPoint[] = rows.map((r) => ({
      id: r.id,
      mapId: r.map_id,
      cityId: r.city_id,
      title: r.title,
      x: r.x,
      y: r.y,
      status: r.status,
    }));
    return c.json({ points });
  } catch {
    return c.json({ points: [] });
  }
});

// POST /api/maps/:id/points - persist point on map
mapsRouter.post("/:id/points", async (c) => {
  const mapId = c.req.param("id").toLowerCase();
  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const { cityId, title, x, y, status = "discovered" } = body;
  if (!cityId || typeof x !== "number" || typeof y !== "number") {
    return c.json({ error: "Missing required fields: cityId, x, y" }, 400);
  }

  const pointId = `pt-${mapId}-${cityId}`;
  try {
    db.query(`
      INSERT INTO map_points (id, map_id, city_id, title, x, y, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(map_id, city_id) DO UPDATE SET
        x = excluded.x,
        y = excluded.y,
        title = excluded.title,
        status = excluded.status
    `).run(
      pointId,
      mapId,
      cityId,
      title || cityId,
      Math.min(Math.max(x, 0), 1),
      Math.min(Math.max(y, 0), 1),
      status,
      new Date().toISOString()
    );

    return c.json({
      status: "ok",
      point: {
        id: pointId,
        mapId,
        cityId,
        title: title || cityId,
        x,
        y,
        status,
      },
    });
  } catch (err: any) {
    return c.json({ error: err?.message || "Failed to persist point" }, 500);
  }
});

// POST /api/maps/import - Phase 2 custom raster import with magic-byte validation
mapsRouter.post("/import", async (c) => {
  try {
    const formData = await c.req.formData();
    const file = formData.get("file");
    const name = String(formData.get("name") || "Custom Map").trim();

    if (!file || !(file instanceof Blob)) {
      return c.json({ error: "Missing uploaded image file" }, 400);
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // 20MB limit
    if (buffer.length > 20 * 1024 * 1024) {
      return c.json({ error: "Image exceeds 20MB size limit" }, 400);
    }

    // Magic byte validation: PNG (89 50 4E 47), JPEG (FF D8 FF), WebP (RIFF....WEBP)
    const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
    const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    const isWebp =
      buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP";

    if (!isPng && !isJpeg && !isWebp) {
      return c.json(
        { error: "Invalid raster format. Only PNG, JPEG, and WebP are permitted (SVG forbidden)." },
        400
      );
    }

    const mapId = `custom-${Date.now()}`;
    const mapDir = path.join(DATA_DIR, "maps", mapId);
    await fs.mkdir(mapDir, { recursive: true });

    // Process high-res WebP (capped at 4096px)
    const metadata = await sharp(buffer).metadata();
    const width = Math.min(metadata.width || 2048, 4096);
    const height = Math.min(metadata.height || 1152, 4096);

    const mapWebpPath = path.join(mapDir, "map.webp");
    await sharp(buffer)
      .resize(width, height, { fit: "inside" })
      .webp({ quality: 85 })
      .toFile(mapWebpPath);

    // Generate 400px thumbnail
    const thumbWebpPath = path.join(mapDir, "thumb.webp");
    await sharp(buffer)
      .resize(400, 225, { fit: "cover" })
      .webp({ quality: 75 })
      .toFile(thumbWebpPath);

    const imageUrl = `/api/maps/files/${mapId}/map.webp`;
    const thumbnailUrl = `/api/maps/files/${mapId}/thumb.webp`;

    // Persist to database
    db.query(`
      INSERT INTO maps (id, name, style, kind, image_url, image_width, image_height, thumbnail_url, license, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      mapId,
      name,
      "custom",
      "imported",
      imageUrl,
      width,
      height,
      thumbnailUrl,
      "User Upload (Local)",
      new Date().toISOString()
    );

    return c.json({
      status: "ok",
      map: {
        id: mapId,
        name,
        style: "custom",
        kind: "imported",
        image: { url: imageUrl, width, height },
        thumbnail: thumbnailUrl,
        license: "User Upload (Local)",
      },
    });
  } catch (err: any) {
    return c.json({ error: err?.message || "Failed to import map" }, 500);
  }
});

// GET /api/maps/files/:id/:filename - secure raster file delivery with nosniff
mapsRouter.get("/files/:id/:filename", async (c) => {
  const mapId = c.req.param("id").replace(/[^a-zA-Z0-9_-]/g, "");
  const filename = c.req.param("filename").replace(/[^a-zA-Z0-9_.-]/g, "");

  if (!filename.endsWith(".webp")) {
    return c.text("Forbidden", 403);
  }

  const filePath = path.join(DATA_DIR, "maps", mapId, filename);
  try {
    const fileBytes = await fs.readFile(filePath);
    c.header("Content-Type", "image/webp");
    c.header("X-Content-Type-Options", "nosniff");
    return c.body(fileBytes);
  } catch {
    return c.text("Not found", 404);
  }
});
