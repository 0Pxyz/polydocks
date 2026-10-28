import { describe, it, expect } from "bun:test";
import { worldToScreen, screenToWorld, renderWorld } from "../src/features/world/renderer/mapPainter";
import { atlasStylePack } from "../src/features/world/styles/atlas";
import { auroraStylePack } from "../src/features/world/styles/aurora";
import { generateMapLayout } from "../src/lib/mapgen/proceduralWorld";
import type { CameraState, MapSpec, Point2D } from "../src/features/world/types";

describe("Procedural Map Painter Renderer (renderWorld)", () => {
  const camera: CameraState = { x: 100, y: -50, zoom: 1.5 };
  const vw = 1280;
  const vh = 720;

  it("transforms world coordinates to screen coordinates accurately", () => {
    const worldPoint: Point2D = { x: 200, y: 150 };
    const screen = worldToScreen(worldPoint, camera, vw, vh);

    // screenX = (200 - 100) * 1.5 + 1280/2 = 150 + 640 = 790
    expect(screen.x).toBe(790);
    // screenY = (150 - (-50)) * 1.5 + 720/2 = 300 + 360 = 660
    expect(screen.y).toBe(660);
  });

  it("inverts screen coordinates back to world coordinates precisely", () => {
    const originalWorld: Point2D = { x: -350, y: 220 };
    const screen = worldToScreen(originalWorld, camera, vw, vh);
    const restoredWorld = screenToWorld(screen, camera, vw, vh);

    expect(Math.round(restoredWorld.x)).toBe(originalWorld.x);
    expect(Math.round(restoredWorld.y)).toBe(originalWorld.y);
  });

  it("renders entire world layout onto mock Canvas 2D context with zero runtime errors", () => {
    const spec: MapSpec = {
      id: "test-map",
      seed: "render-test",
      title: "Test Map",
      createdAt: new Date().toISOString(),
      regions: [
        {
          id: "r1",
          title: "AI",
          topic: "AI",
          cities: [{ id: "c1", title: "ML", tags: [], level: 1 }],
        },
      ],
      connections: [],
    };
    const layout = generateMapLayout(spec);

    // Mock CanvasRenderingContext2D
    const mockCtx = {
      clearRect: () => {},
      createRadialGradient: () => ({ addColorStop: () => {} }),
      fillRect: () => {},
      save: () => {},
      restore: () => {},
      beginPath: () => {},
      closePath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
      fill: () => {},
      arc: () => {},
      setLineDash: () => {},
      fillText: () => {},
      translate: () => {},
      rotate: () => {},
      scale: () => {},
      quadraticCurveTo: () => {},
    } as unknown as CanvasRenderingContext2D;

    expect(() => {
      renderWorld(mockCtx, layout, camera, atlasStylePack, vw, vh);
    }).not.toThrow();

    expect(() => {
      renderWorld(mockCtx, layout, camera, auroraStylePack, vw, vh, {
        hoveredCityId: "c1",
        buildingProgress: { c1: 0.75 },
      });
    }).not.toThrow();
  });
});
