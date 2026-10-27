import { createHash } from "node:crypto";
import { config } from "../config";
import { db } from "../workspace/db";

export type DomainType = "web" | "news" | "research_paper";

export interface SearchHit {
  title: string;
  url: string;
  snippet?: string;
  domainType: DomainType;
  score?: number;
}

export interface FetchResult {
  url: string;
  markdown: string;
  status: number;
}

export interface TinyFishAdapter {
  search(query: string, domainType?: DomainType, limit?: number): Promise<SearchHit[]>;
  fetch(urls: string[]): Promise<FetchResult[]>;
}

const MAX_PAGE_BYTES = 16 * 1024; // 16 KB safety cap

/**
 * Computes deterministic SHA-256 hash for SQLite cache lookup.
 */
function hashKey(prefix: string, key: string): string {
  return createHash("sha256").update(`${prefix}:${key}`).digest("hex");
}

export class TinyFishClient implements TinyFishAdapter {
  private apiKey: string;
  private searchBaseUrl: string;
  private fetchBaseUrl: string;

  constructor(apiKey = config.TINYFISH_API_KEY) {
    this.apiKey = apiKey || "";
    this.searchBaseUrl = "https://api.search.tinyfish.ai";
    this.fetchBaseUrl = "https://api.fetch.tinyfish.ai";
  }

  /**
   * Searches the web, news, or research papers with SQLite caching.
   */
  async search(
    query: string,
    domainType: DomainType = "web",
    limit = 5
  ): Promise<SearchHit[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const cacheKey = hashKey("search", `${domainType}:${limit}:${trimmed}`);
    const now = Math.floor(Date.now() / 1000);

    // 1. Check SQLite cache
    try {
      const cached = db
        .query("SELECT payload, expires_at FROM discovery_cache WHERE query_hash = ?")
        .get(cacheKey) as { payload: string; expires_at: number } | null;

      if (cached && cached.expires_at > now) {
        return JSON.parse(cached.payload);
      }
    } catch {
      // Fall through on cache read error
    }

    // 2. Fetch from TinyFish Search API
    let results: SearchHit[] = [];

    if (!this.apiKey) {
      // Fallback deterministic results when API key is unconfigured in demo/test
      results = [
        {
          title: `${trimmed} - Overview & Key Concepts`,
          url: `https://example.com/learn/${encodeURIComponent(trimmed)}`,
          snippet: `Authoritative guide covering foundational principles of ${trimmed}.`,
          domainType,
        },
        {
          title: `Visualized Introduction to ${trimmed}`,
          url: `https://example.com/visual/${encodeURIComponent(trimmed)}`,
          snippet: `Interactive visual explanations and drills for ${trimmed}.`,
          domainType,
        },
      ];
    } else {
      const url = new URL(this.searchBaseUrl);
      url.searchParams.set("q", trimmed);
      url.searchParams.set("domain_type", domainType);
      url.searchParams.set("limit", String(limit));

      const res = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      });

      if (!res.ok) {
        throw new Error(`TinyFish Search API error ${res.status}: ${await res.text()}`);
      }

      const data = (await res.json()) as any;
      const rawHits = Array.isArray(data) ? data : data.results || data.hits || [];

      results = rawHits.map((h: any) => ({
        title: h.title || h.name || "Untitled Resource",
        url: h.url || h.link,
        snippet: h.snippet || h.summary || "",
        domainType,
      }));
    }

    // 3. Write to SQLite cache (TTL: 24h for news, 7 days for papers/web)
    const ttlSeconds = domainType === "news" ? 86400 : 7 * 86400;
    try {
      db.query(
        `INSERT OR REPLACE INTO discovery_cache (query_hash, query_type, payload, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?)`
      ).run(cacheKey, `search:${domainType}`, JSON.stringify(results), now, now + ttlSeconds);
    } catch {
      // Non-fatal cache write error
    }

    return results;
  }

  /**
   * Batch fetches clean markdown for up to 10 URLs via Chromium render with 16KB safety cap.
   */
  async fetch(urls: string[]): Promise<FetchResult[]> {
    if (!urls || urls.length === 0) return [];
    const cappedUrls = urls.slice(0, 10);
    const now = Math.floor(Date.now() / 1000);
    const results: FetchResult[] = [];
    const missingUrls: string[] = [];

    // 1. Check SQLite cache per URL
    for (const u of cappedUrls) {
      const cacheKey = hashKey("fetch", u);
      try {
        const cached = db
          .query("SELECT payload, expires_at FROM discovery_cache WHERE query_hash = ?")
          .get(cacheKey) as { payload: string; expires_at: number } | null;

        if (cached && cached.expires_at > now) {
          results.push(JSON.parse(cached.payload));
          continue;
        }
      } catch {
        // Cache miss
      }
      missingUrls.push(u);
    }

    if (missingUrls.length === 0) {
      return results;
    }

    // 2. Fetch missing URLs
    let fetchedBatch: FetchResult[] = [];

    if (!this.apiKey) {
      // Mock markdown response when unconfigured
      fetchedBatch = missingUrls.map((u) => ({
        url: u,
        status: 200,
        markdown: `# ${u}\n\nClean markdown extracted by TinyFish adapter.\n\nKey takeaways and authoritative technical review.`,
      }));
    } else {
      const res = await fetch(this.fetchBaseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          urls: missingUrls,
          format: "markdown",
        }),
      });

      if (!res.ok) {
        throw new Error(`TinyFish Fetch API error ${res.status}: ${await res.text()}`);
      }

      const data = (await res.json()) as any;
      const rawList = Array.isArray(data) ? data : data.results || [];

      fetchedBatch = rawList.map((item: any) => {
        let md = item.markdown || item.content || "";
        if (md.length > MAX_PAGE_BYTES) {
          md = md.slice(0, MAX_PAGE_BYTES) + "\n\n...[Truncated to 16KB for security]...";
        }
        return {
          url: item.url,
          status: item.status || 200,
          markdown: md,
        };
      });
    }

    // 3. Cache newly fetched pages in SQLite (TTL: 14 days)
    for (const item of fetchedBatch) {
      const cacheKey = hashKey("fetch", item.url);
      try {
        db.query(
          `INSERT OR REPLACE INTO discovery_cache (query_hash, query_type, payload, created_at, expires_at)
           VALUES (?, ?, ?, ?, ?)`
        ).run(cacheKey, "fetch", JSON.stringify(item), now, now + 14 * 86400);
      } catch {
        // Non-fatal
      }
      results.push(item);
    }

    return results;
  }
}

export const tinyfish = new TinyFishClient();
