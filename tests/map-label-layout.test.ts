import { describe, expect, test } from "bun:test";
import {
  layoutLabels,
  maxLabelsForZoom,
  truncateLabel,
  territoryPriority,
  type LabelCandidate,
  type LabelViewport,
} from "../src/features/world/particle/labelLayout";

const viewport: LabelViewport = { left: 0, top: 0, right: 1400, bottom: 850, zoom: 1 };

function candidate(overrides: Partial<LabelCandidate> & { id: string }): LabelCandidate {
  return { x: 0, y: 0, text: overrides.id, priority: 100, ...overrides };
}

describe("truncateLabel", () => {
  test("keeps short names intact", () => {
    expect(truncateLabel("Stoicism")).toBe("Stoicism");
  });

  test("truncates test/dev-style long names instead of overflowing", () => {
    expect(truncateLabel("City_permEntanglement")).toBe("City_permEntanglemen…");
    expect(truncateLabel("City Power Academy")).toBe("City Power Academy");
    expect(truncateLabel("Test Aid Ws Test City Dock Files")).toBe("Test Aid Ws Test Cit…");
  });
});

describe("maxLabelsForZoom", () => {
  test("hides the long tail when zoomed out, reveals more when zoomed in", () => {
    expect(maxLabelsForZoom(0.45)).toBeLessThan(maxLabelsForZoom(0.6));
    expect(maxLabelsForZoom(0.6)).toBeLessThan(maxLabelsForZoom(0.85));
    expect(maxLabelsForZoom(0.85)).toBeLessThan(maxLabelsForZoom(1.5));
  });
});

describe("layoutLabels", () => {
  test("never renders two labels on top of each other", () => {
    const items = [
      candidate({ id: "global", x: 700, y: 400, text: "Global", priority: 120 }),
      candidate({ id: "stoicism", x: 706, y: 402, text: "Stoicism", priority: 110 }),
    ];
    const placed = layoutLabels(items, viewport);
    expect(placed.length).toBe(1);
    expect(placed[0].id).toBe("global");
  });

  test("overlapping dev cities keep the higher priority one", () => {
    const items = [
      candidate({ id: "test-neural", x: 500, y: 300, text: "Test City Neural", priority: 105 }),
      candidate({ id: "power-academy", x: 502, y: 303, text: "City Power Academy", priority: 115 }),
      candidate({ id: "aid-ws", x: 504, y: 299, text: "Test Aid Ws", priority: 104 }),
      candidate({ id: "dock-files", x: 500, y: 305, text: "Test City Dock Files", priority: 103 }),
    ];
    const placed = layoutLabels(items, viewport);
    const boxes = placed.map((p) => p.box);
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const overlap =
          boxes[i].left < boxes[j].right &&
          boxes[i].right > boxes[j].left &&
          boxes[i].top < boxes[j].bottom &&
          boxes[i].bottom > boxes[j].top;
        expect(overlap).toBe(false);
      }
    }
    expect(placed.some((p) => p.id === "power-academy")).toBe(true);
  });

  test("hidden labels appear on hover or selection", () => {
    const items = [
      candidate({ id: "a", x: 500, y: 300, text: "Alpha Region", priority: 120 }),
      candidate({ id: "b", x: 502, y: 301, text: "Beta Region", priority: 900 }),
    ];
    const placed = layoutLabels(items, viewport);
    expect(placed.map((p) => p.id)).toContain("b");
  });

  test("selection displaces lower priority colliders", () => {
    const items = [
      candidate({ id: "a", x: 500, y: 300, text: "Alpha Region", priority: 200 }),
      candidate({ id: "b", x: 505, y: 302, text: "Beta Region", priority: 1000 }),
    ];
    const placed = layoutLabels(items, viewport);
    expect(placed.map((p) => p.id)).toEqual(["b"]);
  });

  test("culls labels outside the visible world rectangle", () => {
    const items = [candidate({ id: "far", x: 5000, y: 5000, text: "Far Away", priority: 500 })];
    expect(layoutLabels(items, viewport)).toEqual([]);
  });

  test("zoomed-out views keep only a few labels", () => {
    const items = Array.from({ length: 20 }, (_, i) =>
      candidate({ id: `c${i}`, x: 100 + i * 60, y: 100, text: `City ${i}`, priority: 100 + i })
    );
    const tight: LabelViewport = { ...viewport, zoom: 0.45 };
    expect(layoutLabels(items, tight).length).toBeLessThanOrEqual(2);
    const wide: LabelViewport = { ...viewport, zoom: 1.5 };
    expect(layoutLabels(items, wide).length).toBeGreaterThan(2);
  });
});

describe("territoryPriority", () => {
  test("selected beats hovered beats size", () => {
    expect(territoryPriority({ selected: true, hovered: false, radius: 10 })).toBeGreaterThan(
      territoryPriority({ selected: false, hovered: true, radius: 1000 })
    );
    expect(
      territoryPriority({ selected: false, hovered: false, radius: 200 })
    ).toBeGreaterThan(territoryPriority({ selected: false, hovered: false, radius: 50 }));
  });
});
