import { describe, it, expect } from "bun:test";
import fs from "node:fs";
import path from "node:path";

/**
 * Submission README contract (#354): the Architecture section is filled,
 * stale quest/map panels are gone, every local media/doc link resolves,
 * and the browser copy promises only what the demo shows.
 */
describe("submission README (#354)", () => {
  const root = path.resolve(import.meta.dir, "..");
  const readme = fs.readFileSync(path.join(root, "README.md"), "utf-8");

  it("has a filled Architecture section", () => {
    const section = readme.split("## Architecture")[1]?.split("---")[0] ?? "";
    expect(section.trim().length).toBeGreaterThan(200);
    const lowered = section.toLowerCase();
    for (const term of ["microkernel", "capability bus", "dock", "architecture.md"]) {
      expect(lowered).toContain(term);
    }
  });

  it("has no stale quest/map panel references", () => {
    // Scrub the innocent substring inside "request" first.
    const scrubbed = readme.replace(/request/gi, "");
    expect(scrubbed).not.toMatch(/\bquests?\b/i);
    expect(readme.toLowerCase()).not.toContain("learning quests");
  });

  it("every local media and doc link resolves to a file", () => {
    const missing: string[] = [];
    const seen = new Set<string>();
    for (const m of readme.matchAll(/\((docs\/[^)]+|\.env[^)]*|AGENTS\.md|LICENSE)\)/g)) {
      const target = m[1].split("#")[0].split(" ")[0];
      if (seen.has(target)) continue;
      seen.add(target);
      if (!fs.existsSync(path.join(root, target))) missing.push(target);
    }
    expect(missing).toEqual([]);
  });

  it("browser copy promises the fallback, not silent embedding", () => {
    expect(readme).toContain("Open in new tab");
    expect(readme).not.toContain("Sites that block embedding open fine");
    expect(readme).not.toContain("not a stripped-down reader");
  });

  it("states today vs target product status", () => {
    expect(readme).toContain("single-user local runtime");
    expect(readme).toContain("Not built yet");
    expect(readme).toContain("ARCHITECTURE.md");
  });
});
