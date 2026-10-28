import { describe, it, expect } from "bun:test";
import { isPointOnLand } from "../src/features/world/landmask";

describe("Cartography Landmask & Water Nudge (Maps v2)", () => {
  it("correctly identifies coordinates on land near continental centroids", () => {
    // In gloom map, reg-1 is at (0.32, 0.38)
    const onLand = isPointOnLand("gloom", 0.32, 0.38);
    expect(onLand).toBe(true);

    // Site near reg-2 is at (0.70, 0.32)
    const nearSite = isPointOnLand("gloom", 0.70, 0.32);
    expect(nearSite).toBe(true);
  });

  it("correctly identifies open ocean water coordinates outside land boundaries", () => {
    // Deep ocean corner far from all regions
    const inDeepWater = isPointOnLand("gloom", 0.02, 0.02);
    expect(inDeepWater).toBe(false);

    // Bottom left ocean void
    const inBottomVoid = isPointOnLand("gloom", 0.05, 0.95);
    expect(inBottomVoid).toBe(false);
  });
});
