import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";
import { tinyfish } from "./tinyfish";
import { generateCityFeed } from "./feedGenerator";
import { search_web } from "../agent/tools/search_web";
import { fetch_page } from "../agent/tools/fetch_page";
import { readCityFile } from "../workspace/cityWorkspace";

const TEST_CITY = "test-tinyfish-city";
const TEST_DIR = path.resolve(process.cwd(), "workspace", TEST_CITY);

describe("TinyFish Web Discovery & City Feed Engine", () => {
  beforeAll(async () => {
    await fs.mkdir(TEST_DIR, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true }).catch(() => {});
  });

  it("searches topics across web, news, and research papers", async () => {
    const hits = await tinyfish.search("Raft consensus", "research_paper", 3);
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
    const start = Date.now();
    await tinyfish.search("Distributed Systems", "web", 2);
    const firstDuration = Date.now() - start;

    const cacheStart = Date.now();
    const cachedHits = await tinyfish.search("Distributed Systems", "web", 2);
    const cachedDuration = Date.now() - cacheStart;

    expect(cachedHits.length).toBeGreaterThan(0);
    expect(cachedDuration).toBeLessThanOrEqual(firstDuration + 5);
  });

  it("generateCityFeed creates feed.json in city workspace", async () => {
    const feed = await generateCityFeed(TEST_CITY, "Quantum Superposition");
    expect(feed.cityId).toBe(TEST_CITY);
    expect(feed.topic).toBe("Quantum Superposition");
    expect(feed.items.length).toBeGreaterThan(0);

    const savedRaw = await readCityFile(TEST_CITY, "feed.json");
    const saved = JSON.parse(savedRaw);
    expect(saved.cityId).toBe(TEST_CITY);
    expect(saved.items.length).toBe(feed.items.length);
  });

  it("search_web and fetch_page agent tools execute correctly", async () => {
    const searchRes = (await search_web.execute(
      { query: "Byzantine Fault Tolerance", domain_type: "research_paper", limit: 2 },
      { cityId: TEST_CITY, step: 1 }
    )) as any;

    expect(searchRes.count).toBeGreaterThan(0);

    const fetchRes = (await fetch_page.execute(
      { urls: ["https://example.com/bft-paper"], cityId: TEST_CITY, saveToSources: true },
      { cityId: TEST_CITY, step: 2 }
    )) as any;

    expect(fetchRes.count).toBe(1);
  });
});
