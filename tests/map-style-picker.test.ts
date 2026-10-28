import { describe, it, expect } from "bun:test";
import { placeCityOnMap, syncCitiesToMap } from "../src/features/world/placement";
import { MapStylePicker } from "../src/features/world/MapStylePicker";
import type { MapSource, CityPoint } from "../src/features/world/types";

describe("Map Style Switching & Deterministic Placement (Maps v2)", () => {
  const mockMap: MapSource = {
    id: "gloom",
    name: "Abyssal Gloom",
    style: "gloom",
    kind: "bundled",
    image: { url: "/maps/gloom/map.webp", width: 2048, height: 1152 },
    thumbnail: "/maps/gloom/thumb.webp",
    regions: [
      { id: "reg-1", name: "Reach", cx: 0.3, cy: 0.3 },
      { id: "reg-2", name: "Caldera", cx: 0.7, cy: 0.7 },
    ],
    sites: [
      { id: "s-1", name: "Site Alpha", x: 0.25, y: 0.25, regionId: "reg-1", importance: 1 },
      { id: "s-2", name: "Site Beta", x: 0.35, y: 0.35, regionId: "reg-1", importance: 0.7 },
      { id: "s-3", name: "Site Gamma", x: 0.72, y: 0.68, regionId: "reg-2", importance: 1 },
    ],
    license: "MIT",
  };

  it("places city deterministically using exact coordinates when provided", () => {
    const res = placeCityOnMap(mockMap, [], {
      cityId: "city-stoic",
      title: "Stoicism",
      x: 0.5,
      y: 0.5,
    });

    expect(res.status).toBe("placed");
    if (res.status === "placed") {
      expect(res.point.x).toBe(0.5);
      expect(res.point.y).toBe(0.5);
      expect(res.point.mapId).toBe("gloom");
    }
  });

  it("places city inside region when regionHint is provided", () => {
    const res = placeCityOnMap(mockMap, [], {
      cityId: "city-stoic",
      title: "Stoicism",
      regionHint: "Caldera",
    });

    expect(res.status).toBe("placed");
    if (res.status === "placed") {
      expect(res.point.x).toBe(0.72);
      expect(res.point.y).toBe(0.68);
    }
  });

  it("returns needs_user_click for imported map without sites and without exact coordinates", () => {
    const importedMap: MapSource = {
      id: "custom",
      name: "Custom Map",
      style: "custom",
      kind: "imported",
      image: { url: "/custom.png", width: 1000, height: 1000 },
      thumbnail: "/custom-thumb.png",
      license: "User Upload",
    };

    const res = placeCityOnMap(importedMap, [], {
      cityId: "city-stoic",
      title: "Stoicism",
    });

    expect(res.status).toBe("needs_user_click");
  });

  it("syncs all global cities across map switches", () => {
    const existingPoints: CityPoint[] = [];
    const globalCities = [
      { id: "c1", title: "City 1", region: "Reach" },
      { id: "c2", title: "City 2", region: "Caldera" },
    ];

    const synced = syncCitiesToMap(mockMap, existingPoints, globalCities);
    expect(synced.length).toBe(2);
    expect(synced.some((p) => p.cityId === "c1")).toBe(true);
    expect(synced.some((p) => p.cityId === "c2")).toBe(true);
  });

  it("exports MapStylePicker component function", () => {
    expect(typeof MapStylePicker).toBe("function");
    expect(MapStylePicker.name).toBe("MapStylePicker");
  });
});
