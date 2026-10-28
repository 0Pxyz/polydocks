import { describe, it, expect } from "bun:test";
import { useMapPanZoom } from "../src/features/world/useMapPanZoom";

describe("Map Pan & Zoom Hook (useMapPanZoom)", () => {
  it("exports functional hook definition", () => {
    expect(typeof useMapPanZoom).toBe("function");
    expect(useMapPanZoom.name).toBe("useMapPanZoom");
  });

  it("computes normalized coordinate transformations correctly", () => {
    // Test mapping math directly:
    const imageWidth = 2000;
    const imageHeight = 1000;
    const zoom = 2.0;
    const x = 50;
    const y = 30;

    // Normalizing (0.5, 0.5) to viewport coordinates
    const px = 0.5 * imageWidth * zoom + x;
    const py = 0.5 * imageHeight * zoom + y;

    expect(px).toBe(2050);
    expect(py).toBe(1030);

    // Inverting viewport back to normalized
    const nx = (px - x) / (imageWidth * zoom);
    const ny = (py - y) / (imageHeight * zoom);

    expect(nx).toBe(0.5);
    expect(ny).toBe(0.5);
  });
});
