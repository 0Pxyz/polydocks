import { describe, it, expect } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";
import type { MapSourceSpec } from "../scripts/generate-demo-maps";

describe("Bundled Demo Maps Specification (Maps v2)", () => {
  const mapIds = ["gloom", "ancient", "atlas", "monochrome"];
  const mapsDir = path.resolve(process.cwd(), "public/maps");

  it("bundles exactly 4 offline map styles with valid assets", async () => {
    for (const mapId of mapIds) {
      const dir = path.join(mapsDir, mapId);
      const manifestPath = path.join(dir, "map.json");
      const mapWebpPath = path.join(dir, "map.webp");
      const thumbWebpPath = path.join(dir, "thumb.webp");
      const landmaskPath = path.join(dir, "landmask.json");

      // Verify files exist
      const manifestStat = await fs.stat(manifestPath);
      expect(manifestStat.isFile()).toBe(true);

      const mapStat = await fs.stat(mapWebpPath);
      expect(mapStat.size).toBeGreaterThan(5000); // Valid WebP image

      const thumbStat = await fs.stat(thumbWebpPath);
      expect(thumbStat.size).toBeGreaterThan(500);

      const landmaskStat = await fs.stat(landmaskPath);
      expect(landmaskStat.isFile()).toBe(true);

      // Verify manifest contents
      const manifest: MapSourceSpec = JSON.parse(await fs.readFile(manifestPath, "utf-8"));
      expect(manifest.id).toBe(mapId);
      expect(manifest.kind).toBe("bundled");
      expect(manifest.image.width).toBe(2048);
      expect(manifest.image.height).toBe(1152);
      expect(manifest.regions.length).toBeGreaterThanOrEqual(3);
      expect(manifest.sites.length).toBeGreaterThanOrEqual(6);

      // Verify all coordinates are strictly normalized 0 to 1
      for (const reg of manifest.regions) {
        expect(reg.cx).toBeGreaterThanOrEqual(0);
        expect(reg.cx).toBeLessThanOrEqual(1);
        expect(reg.cy).toBeGreaterThanOrEqual(0);
        expect(reg.cy).toBeLessThanOrEqual(1);
      }

      for (const site of manifest.sites) {
        expect(site.x).toBeGreaterThanOrEqual(0);
        expect(site.x).toBeLessThanOrEqual(1);
        expect(site.y).toBeGreaterThanOrEqual(0);
        expect(site.y).toBeLessThanOrEqual(1);
      }
    }
  });
});
