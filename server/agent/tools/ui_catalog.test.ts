import { describe, expect, it } from "bun:test";
import { ui_catalog } from "./ui_catalog";
import { KIT_VERSION } from "../../plugin-kit/catalog";

describe("ui_catalog tool", () => {
  it("returns the versioned index with no args", async () => {
    const out = (await ui_catalog.execute({}, {} as any)) as any;
    expect(out.version).toBe(KIT_VERSION);
    expect(out.index.length).toBeGreaterThan(30);
    expect(out.rules.length).toBeGreaterThan(0);
    const names = out.index.map((e: any) => e.name);
    for (const need of ["Stack", "ListRow", "EmptyState", "ListWithSearch", "Metric"]) {
      expect(names).toContain(need);
    }
  });

  it("returns fichas for named components and flags missing", async () => {
    const out = (await ui_catalog.execute({ query: "ListRow, EmptyState, Nope" }, {} as any)) as any;
    expect(out.details.map((d: any) => d.name).sort()).toEqual(["EmptyState", "ListRow"]);
    expect(out.missing).toEqual(["Nope"]);
    for (const d of out.details) {
      expect(d.props.length).toBeGreaterThan(0);
      expect(d.example).toContain("<");
      expect(d.dont.length).toBeGreaterThan(0);
    }
  });
});
