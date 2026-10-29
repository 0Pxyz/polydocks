import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";
import { db } from "../server/workspace/db";
import { config } from "../server/config";
import {
  getImageSpend,
  imageBudget,
  reserveImageSpend,
  refundImageSpend,
} from "../server/media/budget";
import { requestShareCard } from "../server/media/shareCard";
import { generate_image } from "../server/agent/tools/generate_image";
import { ArtifactService } from "../server/services/artifactService";
import {
  tileMotif,
  tileVariant,
  territoryAccent,
} from "../src/features/city/sourceMedia";

const realFetch = globalThis.fetch;
const TINY_PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function stubImageFetch(): void {
  (globalThis as any).fetch = async (url: any) => {
    if (String(url).endsWith("/images/generations")) {
      return new Response(
        JSON.stringify({ created: 1, data: [{ b64_json: TINY_PNG_B64 }], output_format: "png" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    throw new Error("unexpected fetch " + String(url));
  };
}

describe("imageless feed tiles (deterministic, zero spend)", () => {
  it("tile variant is stable per URL and spreads across rotations", () => {
    expect(tileVariant("https://example.com/a")).toBe(tileVariant("https://example.com/a"));
    const variants = new Set(
      ["https://a.com/1", "https://b.com/2", "https://c.com/3", "https://d.com/4"].map(tileVariant)
    );
    expect(variants.size).toBeGreaterThan(1);
    for (const v of variants) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(2);
    }
  });

  it("tile motif follows the source kind", () => {
    expect(tileMotif("paper")).toBe("rules");
    expect(tileMotif("video")).toBe("rings");
    expect(tileMotif("article")).toBe("diagonal");
    expect(tileMotif(undefined)).toBe("diagonal");
    expect(tileMotif(null)).toBe("diagonal");
  });

  it("territory accent is a stable hsl color per key", () => {
    expect(territoryAccent("TikTok")).toBe(territoryAccent("TikTok"));
    expect(territoryAccent("TikTok")).toMatch(/^hsl\(\d+ 55% 38%\)$/);
  });
});

describe("chat-requested images (budget + artifacts)", () => {
  let spendBefore = 0;
  const createdFiles: string[] = [];
  const createdArtifacts: string[] = [];

  beforeEach(() => {
    stubImageFetch();
    spendBefore = getImageSpend();
  });

  afterEach(async () => {
    globalThis.fetch = realFetch;
    for (const f of createdFiles.splice(0)) {
      await fs.rm(f, { force: true }).catch(() => {});
    }
    for (const id of createdArtifacts.splice(0)) {
      try {
        ArtifactService.deleteArtifact(id, "user");
      } catch {
        // Non-fatal.
      }
    }
    try {
      const today = new Date().toISOString().slice(0, 10);
      db.query("UPDATE image_spend SET count = ? WHERE day = ?").run(spendBefore, today);
    } catch {
      // Non-fatal.
    }
  });

  it("reserve/refund round-trips the daily budget", () => {
    expect(reserveImageSpend()).toBe(true);
    expect(getImageSpend()).toBe(spendBefore + 1);
    refundImageSpend();
    expect(getImageSpend()).toBe(spendBefore);
    expect(imageBudget().remaining).toBeGreaterThanOrEqual(0);
  });

  it("refuses to reserve past the cap instead of spending", () => {
    const savedMax = config.IMAGE_MAX_PER_DAY;
    (config as any).IMAGE_MAX_PER_DAY = getImageSpend();
    try {
      expect(reserveImageSpend()).toBe(false);
    } finally {
      (config as any).IMAGE_MAX_PER_DAY = savedMax;
    }
    expect(getImageSpend()).toBe(spendBefore);
  });

  it("share card rejects invalid input without spending", async () => {
    const out = await requestShareCard({ city: "" } as any);
    expect(out.ok).toBe(false);
    expect(out.code).toBe("invalid_input");
    expect(getImageSpend()).toBe(spendBefore);
  });

  it("generate_image saves the file to the user's artifacts", async () => {
    const out: any = await generate_image.execute(
      {
        prompt: `test artifact image ${Date.now()}`,
        size: "1024x1024",
        outputFormat: "png",
        kind: "cover",
        name: "test-artifact-image",
      } as any,
      { step: 1, workspaceId: "test-artifacts-ws" }
    );
    expect(out.ok).toBe(true);
    expect(typeof out.artifactId).toBe("string");
    createdArtifacts.push(out.artifactId);

    const abs = path.resolve(out.path);
    createdFiles.push(abs);
    const stat = await fs.stat(abs);
    expect(stat.size).toBeGreaterThan(0);

    const artifact = ArtifactService.getArtifact(out.artifactId);
    expect(artifact).toBeTruthy();
    expect(artifact!.type).toBe("image");
    expect(artifact!.workspaceId).toBe("test-artifacts-ws");
    expect((artifact!.metadata as any)?.url).toBe(out.url);

    // Listed alongside the user's other artifacts.
    const listed = ArtifactService.listArtifacts("test-artifacts-ws");
    expect(listed.map((a) => a.id)).toContain(out.artifactId);
  });
});
