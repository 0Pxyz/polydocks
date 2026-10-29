import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { generateServiceWorkerFile } from "../scripts/generate-sw";

function makeFakeDist(): { dist: string; readSw: () => string } {
  const dist = mkdtempSync(path.join(tmpdir(), "polymax-sw-"));
  mkdirSync(path.join(dist, "assets"));
  writeFileSync(path.join(dist, "index.html"), "<html></html>");
  writeFileSync(path.join(dist, "assets", "main.abc123.js"), "[]");
  writeFileSync(path.join(dist, "favicon.svg"), "<svg/>");
  return { dist, readSw: () => Bun.file(path.join(dist, "sw.js")).text() };
}

describe("generateServiceWorkerFile", () => {
  test("precaches app entry and hashed assets, never /api", async () => {
    const { dist, readSw } = makeFakeDist();
    await generateServiceWorkerFile(dist);
    const sw = await readSw();

    expect(sw).toContain('"/"');
    expect(sw).toContain("/assets/main.abc123.js");
    expect(sw).toContain("/favicon.svg");
    const precacheUrls: string[] = JSON.parse(
      sw.match(/const PRECACHE_URLS = (\[.*?\]);/)?.[1] ?? "[]"
    );
    expect(precacheUrls.some((url) => url.startsWith("/api"))).toBe(false);
    expect(sw.startsWith("/* Polymax service worker")).toBe(true);

    rmSync(dist, { recursive: true, force: true });
  });

  test("fails loudly when the build has no index.html", async () => {
    const dist = mkdtempSync(path.join(tmpdir(), "polymax-sw-empty-"));
    await expect(generateServiceWorkerFile(dist)).rejects.toThrow("index.html");
    rmSync(dist, { recursive: true, force: true });
  });

  test("cache id is stable while the output is unchanged", async () => {
    const { dist, readSw } = makeFakeDist();
    await generateServiceWorkerFile(dist);
    const first = (await readSw()).match(/polymax-([0-9a-f]+)/)?.[1];
    await generateServiceWorkerFile(dist);
    const second = (await readSw()).match(/polymax-([0-9a-f]+)/)?.[1];
    expect(first).toBe(second);

    rmSync(dist, { recursive: true, force: true });
  });
});
