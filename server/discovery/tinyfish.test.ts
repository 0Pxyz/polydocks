import { afterAll, beforeAll, beforeEach, afterEach, describe, expect, it } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";
import { tinyfish, TinyFishError } from "./tinyfish";
import { generateCityFeed } from "./feedGenerator";
import { search_web } from "../agent/tools/search_web";
import { fetch_page } from "../agent/tools/fetch_page";
import { readCityFile } from "../workspace/cityWorkspace";
import { db } from "../workspace/db";

const TEST_CITY = "test-tinyfish-city";
const TEST_DIR = path.resolve(process.cwd(), "workspace", TEST_CITY);

const realFetch = globalThis.fetch;
const uniq = () => `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Hermetic TinyFish: canned API responses, real parsing/caching logic. */
function stubTinyFish(mode: "ok" | "search-down" | "fetch-down" = "ok") {
  (globalThis as any).fetch = async (url: any, init?: any) => {
    const u = String(url);
    if (u.includes("api.search.tinyfish.ai")) {
      if (mode === "search-down") return new Response("boom", { status: 500 });
      const q = new URL(u).searchParams.get("query") || "topic";
      return Response.json({
        results: [
          { title: `${q} paper`, url: "https://arxiv.org/abs/2301.00001", snippet: "S1" },
          { title: `${q} guide`, url: "https://example.org/guide", snippet: "S2" },
        ],
      });
    }
    if (u.includes("api.fetch.tinyfish.ai")) {
      if (mode === "fetch-down") return new Response("boom", { status: 500 });
      const body = (() => { try { return JSON.parse((init as any)?.body || "{}"); } catch { return {}; } })();
      const urls: string[] = Array.isArray(body.urls) ? body.urls : [];
      return Response.json({
        results: urls.map((pageUrl: string) => ({ url: pageUrl, status: 200, markdown: `# ${pageUrl}\n\n${"word ".repeat(50)}` })),
      });
    }
    return realFetch(url, init);
  };
}

describe("TinyFish Web Discovery & City Feed Engine", () => {
  beforeAll(async () => {
    await fs.mkdir(TEST_DIR, { recursive: true });
  });

  beforeEach(() => {
    stubTinyFish("ok");
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    db.query("DELETE FROM sources WHERE city_id = ?").run(TEST_CITY);
  });

  afterAll(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true }).catch(() => {});
    db.query("DELETE FROM sources WHERE city_id = ?").run(TEST_CITY);
  });

  it("searches topics across web, news, and research papers", async () => {
    const hits = await tinyfish.search(`Raft consensus ${uniq()}`, "research_paper", 3);
    expect(Array.isArray(hits)).toBe(true);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].domainType).toBe("research_paper");
  });

  it("fetches clean markdown pages with 16KB safety cap", async () => {
    const pages = await tinyfish.fetch(["https://example.com/test-article"]);
    expect(pages.length).toBe(1);
    expect(pages[0].url).toBe("https://example.com/test-article");
    expect(pages[0].markdown.length).toBeLessThanOrEqual(16 * 1024 + 100);
  });

  it("caches repeated search queries in SQLite", async () => {
    const q = `Distributed Systems ${uniq()}`;
    await tinyfish.search(q, "web", 2);

    const cacheStart = Date.now();
    const cachedHits = await tinyfish.search(q, "web", 2);
    const cachedDuration = Date.now() - cacheStart;

    expect(cachedHits.length).toBeGreaterThan(0);
    expect(cachedDuration).toBeLessThan(200);

    // Verify cache persistence in SQLite database
    const cachedRow = db
      .query("SELECT COUNT(*) as c FROM discovery_cache WHERE query_type = 'search:web'")
      .get() as any;
    expect(cachedRow.c).toBeGreaterThan(0);
  });

  it("search failure throws a typed error and caches nothing fake", async () => {
    stubTinyFish("search-down");
    const q = `Unreachable Topic ${uniq()}`;
    let thrown: unknown = null;
    try {
      await tinyfish.search(q, "web", 2);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(TinyFishError);
    expect(String((thrown as Error).message)).not.toContain("example.com");
    const row = db
      .query("SELECT COUNT(*) as c FROM discovery_cache WHERE payload LIKE '%example.com/learn%'")
      .get() as any;
    expect(row.c).toBe(0);
  });

  it("fetch failure throws a typed error instead of fake markdown", async () => {
    stubTinyFish("fetch-down");
    let thrown: unknown = null;
    try {
      await tinyfish.fetch(["https://example.com/real-article"]);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(TinyFishError);
  });

  it("generateCityFeed creates feed.json in city workspace", async () => {
    const feed = await generateCityFeed(TEST_CITY, `Quantum Superposition ${uniq()}`);
    expect(feed.cityId).toBe(TEST_CITY);
    expect(feed.topic).toContain("Quantum Superposition");
    expect(feed.items.length).toBeGreaterThan(0);

    const savedRaw = await readCityFile(TEST_CITY, "feed.json");
    const saved = JSON.parse(savedRaw);
    expect(saved.cityId).toBe(TEST_CITY);
    expect(saved.items.length).toBe(feed.items.length);
  });

  it("search_web and fetch_page agent tools execute correctly", async () => {
    const searchRes = (await search_web.execute(
      { query: `Byzantine Fault Tolerance ${uniq()}`, domain_type: "research_paper", limit: 2 },
      { cityId: TEST_CITY, step: 1 }
    )) as any;

    expect(searchRes.count).toBeGreaterThan(0);

    const fetchRes = (await fetch_page.execute(
      { urls: ["https://example.com/bft-paper"], cityId: TEST_CITY, saveToSources: true },
      { cityId: TEST_CITY, step: 2 }
    )) as any;

    expect(fetchRes.count).toBe(1);
  });

  it("search_web surfaces API errors instead of fabricating results", async () => {
    stubTinyFish("search-down");
    const searchRes = (await search_web.execute(
      { query: `Down Topic ${uniq()}`, domain_type: "web", limit: 2 },
      { cityId: TEST_CITY, step: 1 }
    )) as any;
    expect(searchRes.count).toBe(0);
    expect(searchRes.error || "").not.toBe("");
    expect(JSON.stringify(searchRes)).not.toContain("example.com/learn");
  });
});
