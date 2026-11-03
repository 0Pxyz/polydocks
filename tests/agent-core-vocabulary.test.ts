import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";

/**
 * Core vocabulary boundary (#153 task 5): the core knows plugins and
 * opaque context — never cities. Fails if any core file mentions
 * city/cities/cityId outside the versioned exception list below, which
 * doubles as the migration backlog for the remaining references.
 */

const REPO = path.resolve(import.meta.dir, "..");

const SCOPES = ["server/agent", "server/facade", "src/features/dock", "server/plugins", "src/lib/dock", "src/lib/agent"];

interface Exception {
  file: string;
  pattern: string;
  reason: string;
}

const EXCEPTIONS: Exception[] = [
  {
    file: "server/agent/tools/tools.test.ts",
    pattern: "enter_city|get_city_context|read_city_file|write_city_file|build_city|place_city|connect_cities",
    reason: "Gone-list: asserts removed city tools stay removed.",
  },
];

const CITY_RE = /\bcity\b|\bcities\b|\bcityid\b/i;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      walk(full, out);
    } else if (/\.(ts|tsx|md)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

describe("core vocabulary boundary (#153)", () => {
  it("contains no city/cities/cityId outside the exception list", () => {
    const violations: string[] = [];
    for (const scope of SCOPES) {
      for (const file of walk(path.join(REPO, scope))) {
        const rel = path.relative(REPO, file);
        const text = fs.readFileSync(file, "utf-8");
        const lines = text.split("\n");
        lines.forEach((line, i) => {
          if (!CITY_RE.test(line)) return;
          const excused = EXCEPTIONS.some(
            (e) => rel === e.file && new RegExp(e.pattern, "i").test(line)
          );
          if (!excused) violations.push(`${rel}:${i + 1}: ${line.trim().slice(0, 120)}`);
        });
      }
    }
    expect(violations).toEqual([]);
  });

  it("keeps the exception list honest: every entry still matches", () => {
    for (const e of EXCEPTIONS) {
      const text = fs.readFileSync(path.join(REPO, e.file), "utf-8");
      expect(new RegExp(e.pattern, "i").test(text)).toBe(true);
    }
  });
});
