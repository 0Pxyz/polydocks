import { describe, expect, test, beforeEach } from "bun:test";
import { platformStorage } from "../src/lib/platform/storage";
import {
  describeRegion,
  getLastCityTool,
  setLastCityTool,
} from "../src/lib/city/cityModel";

describe("describeRegion", () => {
  test("composes concepts plus real counts on one line", () => {
    expect(
      describeRegion({ concepts: ["Attention", "Transformers"], sources: 4, notes: 2, quests: 3, doneQuests: 1 })
    ).toBe("Attention · Transformers · 4 sources · 2 notes · 1 of 3 quests");
  });

  test("marks completed quest sets as done", () => {
    expect(describeRegion({ sources: 0, notes: 1, quests: 2, doneQuests: 2 })).toBe(
      "1 note · 2 quests done"
    );
  });

  test("shows the real empty counts when nothing exists", () => {
    expect(describeRegion({ sources: 0, notes: 0, quests: 0, doneQuests: 0 })).toBe(
      "Nothing saved here yet"
    );
  });

  test("never renders placeholder prose for bare territories", () => {
    const text = describeRegion({ sources: 0, notes: 0, quests: 0, doneQuests: 0 });
    expect(text).not.toMatch(/knowledge territory/i);
    expect(text).not.toMatch(/lorem|placeholder/i);
  });

  test("concepts without data stay truthful", () => {
    expect(describeRegion({ concepts: ["Stoicism"], sources: 0, notes: 0, quests: 0, doneQuests: 0 })).toBe(
      "Stoicism · nothing saved yet"
    );
  });
});

describe("last city tool", () => {
  beforeEach(() => {
    platformStorage.removeItem("polymax-city-last-tool");
  });

  test("first visit opens nothing", () => {
    expect(getLastCityTool("athens")).toBeNull();
  });

  test("round-trips per city without leaking across cities", () => {
    setLastCityTool("athens", "notes");
    setLastCityTool("florence", "quests");
    expect(getLastCityTool("athens")).toBe("notes");
    expect(getLastCityTool("florence")).toBe("quests");
    expect(getLastCityTool("unknown")).toBeNull();
  });
});
