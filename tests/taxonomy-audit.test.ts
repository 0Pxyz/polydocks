import { describe, it, expect } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { DOCK_CORE_CATALOG } from "../src/lib/dock/dockModel";

/**
 * Taxonomy audit contract (#362): the published report covers the six
 * capabilities and the full matrix, and its dock claims match the real
 * catalog (browser + notes pinned, sources feed unpinned by design).
 */
describe("taxonomy audit (#362)", () => {
  const root = path.resolve(import.meta.dir, "..");
  const report = fs.readFileSync(path.join(root, "internal-docs/plugin-taxonomy-audit.md"), "utf-8");

  it("covers the six capabilities and the recommendation matrix", () => {
    for (const cap of ["Tasks", "Notes", "Files", "Research", "Code/Terminal", "Plugin Store"]) {
      expect(report).toContain(cap);
    }
    for (const heading of ["Keep (default dock)", "Consolidate", "Internal capability", "Archive"]) {
      expect(report).toMatch(new RegExp(heading.replace(/[()]/g, "\\$&")));
    }
  });

  it("names every first-party plugin with a verdict", () => {
    for (const id of ["browser", "notes", "sources", "sandbox", "files", "onboarding", "kit-gallery", "inspect"]) {
      expect(report).toContain(`\`${id}\``);
    }
  });

  it("dock claims match the real catalog", () => {
    const ids = DOCK_CORE_CATALOG.map((d) => d.id);
    expect(ids).toContain("browser");
    expect(ids).toContain("notes");
    // Sources feed lives inside Browser by design: no separate pin.
    expect(ids).not.toContain("sources");
  });
});
