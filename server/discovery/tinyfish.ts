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

export class TinyFishError extends Error {
  readonly retryable: boolean;
  constructor(message: string, retryable = true) {
    super(message);
    this.name = "TinyFishError";
    this.retryable = retryable;
  }
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

    // 2. Fetch from TinyFish Search API. No mock fallback: on network or
    // API error the call throws a typed TinyFishError and nothing is
    // cached, so fake results can never be served or persisted as real.
    let results: SearchHit[] = [];

    {
      const url = new URL(this.searchBaseUrl);
      url.searchParams.set("query", trimmed);
      if (domainType) {
        url.searchParams.set("domain_type", domainType);
      }

      let res: Response;
      try {
        res = await fetch(url.toString(), {
          headers: {
            "X-API-Key": this.apiKey,
          },
        });
      } catch (err: any) {
        throw new TinyFishError(
          `Search is unavailable (network error: ${err?.message || err}). Check your connection and try again.`,
          true
        );
      }

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        console.error(`[TinyFish Search Error] HTTP ${res.status}: ${errText}`);
        throw new TinyFishError(
          `Search is unavailable (TinyFish API error ${res.status}). Check TINYFISH_API_KEY and try again.`,
          res.status >= 500
        );
      }

      const data = (await res.json()) as any;
      const rawHits = Array.isArray(data) ? data : data.results || data.hits || [];

      results = rawHits.slice(0, limit).map((h: any) => ({
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

    // 2. Fetch missing URLs. No mock fallback: failures are reported
    // honestly per URL (status 0, error text) or throw when the API itself
    // is unreachable, so nothing fabricated is ever cached or rendered.
    let fetchedBatch: FetchResult[] = [];

    {
      let res: Response;
      try {
        res = await fetch(this.fetchBaseUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": this.apiKey,
          },
          body: JSON.stringify({
            urls: missingUrls,
            format: "markdown",
          }),
        });
      } catch (err: any) {
        throw new TinyFishError(
          `Fetch is unavailable (network error: ${err?.message || err}). Check your connection and try again.`,
          true
        );
      }

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        console.error(`[TinyFish Fetch Error] HTTP ${res.status}: ${errText}`);
        throw new TinyFishError(
          `Fetch is unavailable (TinyFish API error ${res.status}). Check TINYFISH_API_KEY and try again.`,
          res.status >= 500
        );
      }

      const data = (await res.json()) as any;
      const rawList = Array.isArray(data) ? data : data.results || [];

      fetchedBatch = rawList.map((item: any) => {
        let md = item.text || item.markdown || item.content || "";
        if (md.length > MAX_PAGE_BYTES) {
          md = md.slice(0, MAX_PAGE_BYTES) + "\n\n...[Truncated to 16KB for security]...";
        }
        return {
          url: item.url,
          status: item.status || 200,
          markdown: md,
        };
      });

      // Ensure errors/missing pages are also returned with status
      if (data.errors && Array.isArray(data.errors)) {
        for (const errItem of data.errors) {
          if (!fetchedBatch.some((f) => f.url === errItem.url)) {
            fetchedBatch.push({
              url: errItem.url,
              status: errItem.status || 404,
              markdown: `# ${errItem.url}\n\nContent unavailable (${errItem.error || "not found"}).`,
            });
          }
        }
      }
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
