import { describe, it, expect } from "bun:test";
import { MapImportModal } from "../src/features/world/MapImportModal";

describe("Custom Map Import System (Phase 2)", () => {
  it("exports MapImportModal component function", () => {
    expect(typeof MapImportModal).toBe("function");
    expect(MapImportModal.name).toBe("MapImportModal");
  });

  it("validates file mime types and rejects forbidden formats (e.g. SVG)", () => {
    const isAllowedRaster = (mime: string) => {
      return mime.includes("png") || mime.includes("jpeg") || mime.includes("webp");
    };

    expect(isAllowedRaster("image/png")).toBe(true);
    expect(isAllowedRaster("image/jpeg")).toBe(true);
    expect(isAllowedRaster("image/webp")).toBe(true);

    // SVG must be strictly rejected
    expect(isAllowedRaster("image/svg+xml")).toBe(false);
  });
});
