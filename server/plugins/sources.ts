import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import { db } from "../workspace/db";
import { defineCapability } from "./contract";
import { validateUrlForSsrf } from "./ssrf";

/**
 * Sources first-party plugin (contract-based).
 *
 * Single enriched store (SQLite `sources` table) replaces legacy shapes
 * (workspace/sources/* filenames, hand-written feed.json, pipeline feed.json):
 * the agent passes a URL, the SERVER enriches and validates.
 * Feed UI reads this table — never filenames, never raw feed.json.
 */

export const SOURCES_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  city_id TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'article',
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  site TEXT,
  image TEXT,
  author TEXT,
  published_at TEXT,
  read_minutes INTEGER,
  duration_sec INTEGER,
  hook TEXT,
  full_text TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(city_id, url)
);
`;

export function ensureSourcesSchema(): void {
  db.exec(SOURCES_TABLE_SQL);
}

export type SourceKind = "article" | "paper" | "video";

export interface SourceRow {
  id: string;
  cityId: string;
  kind: SourceKind;
  url: string;
  title: string;
  site: string | null;
  image: string | null;
  author: string | null;
  publishedAt: string | null;
  readMinutes: number | null;
  durationSec: number | null;
  hook: string | null;
  fullText: string | null;
}

const TRACKING_PARAMS = new Set([
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
  "utm_id", "gclid", "fbclid", "msclkid", "mc_cid", "mc_eid", "ref", "ref_src",
]);

/** Canonical form used for dedupe: lowercase host, no fragment, no trackers. */
export function canonicalizeUrl(raw: string): string {
  const u = new URL(raw);
  u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
  u.hash = "";
  for (const key of [...u.searchParams.keys()]) {
    if (TRACKING_PARAMS.has(key.toLowerCase())) u.searchParams.delete(key);
  }
  let out = u.toString();
  if (out.endsWith("/") && u.pathname === "/") out = out.slice(0, -1);
  return out;
}

export function siteFromUrl(raw: string): string {
  try {
    return new URL(raw).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "web";
  }
}

export function youtubeId(raw: string): string | null {
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    if (host === "youtu.be") {
      const id = u.pathname.slice(1).split("/")[0];
      return id || null;
    }
    if (host.endsWith("youtube.com")) {
      const v = u.searchParams.get("v");
      if (v) return v;
      const m = u.pathname.match(/^\/(embed|shorts|live)\/([\w-]{6,})/);
      if (m) return m[2];
    }
    return null;
  } catch {
    return null;
  }
}

export function vimeoId(raw: string): string | null {
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    if (host === "vimeo.com" || host.endsWith(".vimeo.com")) {
      const m = u.pathname.match(/^\/(?:video\/)?(\d+)/);
      return m ? m[1] : null;
    }
    return null;
  } catch {
    return null;
  }
}

const PAPER_HOSTS = [
  "arxiv.org",
  "doi.org",
  "pubmed.ncbi.nlm.nih.gov",
  "nature.com",
  "science.org",
  "cell.com",
  "thelancet.com",
  "nejm.org",
  "plos.org",
  "biorxiv.org",
  "medrxiv.org",
  "pmc.ncbi.nlm.nih.gov",
];

export function inferKind(url: string, explicit?: string): SourceKind {
  if (explicit === "video" || explicit === "paper" || explicit === "article") return explicit;
  if (youtubeId(url) || vimeoId(url)) return "video";
  const lower = url.toLowerCase();
  if (lower.endsWith(".pdf") || lower.includes(".pdf?")) return "paper";
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    if (host === "arxiv.org" || host.endsWith(".arxiv.org")) return "paper";
    if (host === "doi.org" || host.endsWith(".doi.org")) return "paper";
    if (PAPER_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return "paper";
  } catch {
    // fall through
  }
  return "article";
}

function metaContent(html: string, property: string): string | null {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']|<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`,
    "i"
  );
  const m = html.match(re);
  return (m?.[1] || m?.[2] || null)?.trim() || null;
}

function titleTag(html: string): string | null {
  const m = html.match(/<title[^>]*>([^<]{1,300})<\/title>/i);
  return m?.[1]?.trim() || null;
}

function firstHeading(markdown: string): string | null {
  for (const line of markdown.split("\n")) {
    const t = line.trim();
    if (t.startsWith("# ")) return t.slice(2).trim().slice(0, 200);
    if (t.startsWith("## ")) return t.slice(3).trim().slice(0, 200);
  }
  return null;
}

function firstMarkdownImage(markdown: string): string | null {
  const m = markdown.match(/!\[.*?\]\((https?:\/\/[^\s\)]+)\)/);
  return m?.[1]?.trim() || null;
}

export interface EnrichedSource {
  url: string;
  title: string | null;
  site: string;
  image: string | null;
  author: string | null;
  publishedAt: string | null;
  kind: SourceKind;
  fullText: string | null;
  readMinutes: number | null;
}

/**
 * Server-side enrichment: canonical URL, SSRF-checked fetches, og tags,
 * YouTube/Vimeo oEmbed, kind inference. Pure data — no model calls.
 */
export async function enrichSource(
  rawUrl: string,
  opts: { title?: string; kind?: string; fetchMarkdown?: (url: string) => Promise<string | null> }
): Promise<EnrichedSource> {
  const ssrf = validateUrlForSsrf(rawUrl);
  if (!ssrf.safe || !ssrf.url) {
    throw Object.assign(new Error(`Unsafe URL: ${ssrf.reason || "rejected"}`), { retryable: false });
  }
  const url = canonicalizeUrl(ssrf.url.toString());
  const site = siteFromUrl(url);
  const yt = youtubeId(url);
  const vm = vimeoId(url);

  // YouTube: oEmbed returns title, author, thumbnail
  if (yt) {
    try {
      const res = await fetch(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
        { signal: AbortSignal.timeout(15000) }
      );
      if (res.ok) {
        const meta = (await res.json()) as any;
        return {
          url,
          title: opts.title || meta.title || null,
          site: "youtube.com",
          image: meta.thumbnail_url || `https://i.ytimg.com/vi/${yt}/hqdefault.jpg`,
          author: meta.author_name || null,
          publishedAt: null,
          kind: "video",
          fullText: null,
          readMinutes: null,
        };
      }
    } catch {
      // Fall through to generic enrichment
    }
    return {
      url,
      title: opts.title || null,
      site: "youtube.com",
      image: `https://i.ytimg.com/vi/${yt}/hqdefault.jpg`,
      author: null,
      publishedAt: null,
      kind: "video",
      fullText: null,
      readMinutes: null,
    };
  }

  // Vimeo: oEmbed returns title, author, thumbnail
  if (vm) {
    try {
      const res = await fetch(
        `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`,
        { signal: AbortSignal.timeout(15000) }
      );
      if (res.ok) {
        const meta = (await res.json()) as any;
        return {
          url,
          title: opts.title || meta.title || null,
          site: "vimeo.com",
          image: meta.thumbnail_url || `https://vumbnail.com/${vm}.jpg`,
          author: meta.author_name || null,
          publishedAt: null,
          kind: "video",
          fullText: null,
          readMinutes: null,
        };
      }
    } catch {
      // Fall through
    }
    return {
      url,
      title: opts.title || null,
      site: "vimeo.com",
      image: `https://vumbnail.com/${vm}.jpg`,
      author: null,
      publishedAt: null,
      kind: "video",
      fullText: null,
      readMinutes: null,
    };
  }

  // Generic page: og tags from HTML head (capped), markdown for full text
  let html = "";
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(20000),
      headers: { "User-Agent": "PolyDocksBot/1.0 (+https://polymax.app)", Accept: "text/html" },
      redirect: "follow",
    } as any);
    const text = await res.text();
    html = text.slice(0, 65536);
  } catch {
    html = "";
  }

  let fullText: string | null = null;
  try {
    fullText = await opts.fetchMarkdown?.(url);
  } catch {
    fullText = null;
  }
  if (fullText && fullText.length > 12000) fullText = fullText.slice(0, 12000);

  const title =
    opts.title ||
    metaContent(html, "og:title") ||
    (fullText ? firstHeading(fullText) : null) ||
    titleTag(html) ||
    null;

  const image =
    metaContent(html, "og:image") ||
    metaContent(html, "twitter:image") ||
    (fullText ? firstMarkdownImage(fullText) : null) ||
    null;

  const author = metaContent(html, "author") || metaContent(html, "og:author") || null;
  const publishedAt =
    metaContent(html, "article:published_time") || metaContent(html, "og:published_time") || null;
  const words = fullText ? fullText.split(/\s+/).length : 0;

  return {
    url,
    title,
    site,
    image,
    author,
    publishedAt,
    kind: inferKind(url, opts.kind),
    fullText,
    readMinutes: words > 0 ? Math.max(1, Math.round(words / 200)) : null,
  };
}

function rowFromDb(r: any): SourceRow {
  return {
    id: r.id,
    cityId: r.city_id,
    kind: r.kind,
    url: r.url,
    title: r.title,
    site: r.site ?? null,
    image: r.image ?? null,
    author: r.author ?? null,
    publishedAt: r.published_at ?? null,
    readMinutes: r.read_minutes ?? null,
    durationSec: r.duration_sec ?? null,
    hook: r.hook ?? null,
    fullText: r.full_text ?? null,
  };
}

export function getSourceById(id: string): SourceRow | null {
  ensureSourcesSchema();
  const row = db.query("SELECT * FROM sources WHERE id = ?").get(id) as any;
  return row ? rowFromDb(row) : null;
}

export function listSources(cityId: string): SourceRow[] {
  ensureSourcesSchema();
  const rows = db
    .query("SELECT * FROM sources WHERE city_id = ? ORDER BY created_at ASC")
    .all(cityId) as any[];
  return rows.map(rowFromDb);
}

export const AddSourceInput = z.object({
  url: z.string().url().describe("Source URL to enrich and save"),
  cityId: z.string().min(1).describe("City workspace id"),
  title: z.string().optional().describe("Optional title override (verified against the page)"),
  kind: z.enum(["article", "paper", "video"]).optional().describe("Optional kind override"),
});

export const AddSourceOutput = z.object({
  id: z.string(),
  cityId: z.string(),
  kind: z.enum(["article", "paper", "video"]),
  url: z.string(),
  title: z.string(),
  site: z.string().nullable(),
  image: z.string().nullable(),
  author: z.string().nullable(),
  publishedAt: z.string().nullable(),
  readMinutes: z.number().nullable(),
  durationSec: z.number().nullable(),
  deduped: z.boolean(),
});

/**
 * Migrates existing city workspace data (feed.json and sources/*.json) into
 * the SQLite sources table so the feed never has to read raw files.
 */
export async function migrateLegacyCitySources(): Promise<{ migratedCount: number }> {
  ensureSourcesSchema();
  const workspaceRoot = path.resolve(process.cwd(), "workspace");
  let count = 0;
  try {
    const entries = await fs.readdir(workspaceRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      const cityId = entry.name;

      // 1. Check feed.json
      try {
        const feedPath = path.join(workspaceRoot, cityId, "feed.json");
        const raw = await fs.readFile(feedPath, "utf-8");
        const feed = JSON.parse(raw);
        const items = Array.isArray(feed.items) ? feed.items : [];
        for (const item of items) {
          if (!item.url || !item.title) continue;
          let canon = "";
          try {
            canon = canonicalizeUrl(item.url);
          } catch {
            continue;
          }
          const existing = db
            .query("SELECT id FROM sources WHERE city_id = ? AND url = ?")
            .get(cityId, canon);
          if (!existing) {
            const id = `src_mig_${cityId.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_${Math.random().toString(36).slice(2, 8)}`;
            const kind = inferKind(canon, item.kind);
            const site = siteFromUrl(canon);
            const now = new Date().toISOString();
            db.query(
              `INSERT OR IGNORE INTO sources (id, city_id, kind, url, title, site, image, author, published_at, read_minutes, duration_sec, hook, full_text, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).run(
              id,
              cityId,
              kind,
              canon,
              item.title,
              site,
              item.image || null,
              item.author || null,
              null,
              item.readTimeMinutes || (kind === "video" ? null : 6),
              item.durationSec || (kind === "video" ? 600 : null),
              item.summary || item.why || null,
              null,
              now
            );
            count++;
          }
        }
      } catch {
        // No feed.json
      }

      // 2. Check sources/ directory
      try {
        const sourcesDir = path.join(workspaceRoot, cityId, "sources");
        const files = await fs.readdir(sourcesDir, { withFileTypes: true });
        for (const file of files) {
          if (!file.isFile() || !file.name.endsWith(".json")) continue;
          try {
            const content = await fs.readFile(path.join(sourcesDir, file.name), "utf-8");
            const data = JSON.parse(content);
            if (data.url) {
              let canon = "";
              try {
                canon = canonicalizeUrl(data.url);
              } catch {
                continue;
              }
              const existing = db
                .query("SELECT id FROM sources WHERE city_id = ? AND url = ?")
                .get(cityId, canon);
              if (!existing) {
                const id = `src_mig_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
                const kind = inferKind(canon, data.kind);
                const title =
                  data.title ||
                  (data.markdown ? firstHeading(data.markdown) : null) ||
                  file.name.replace(/\.json$/, "").replace(/_/g, " ");
                const now = new Date().toISOString();
                db.query(
                  `INSERT OR IGNORE INTO sources (id, city_id, kind, url, title, site, image, author, published_at, read_minutes, duration_sec, hook, full_text, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
                ).run(
                  id,
                  cityId,
                  kind,
                  canon,
                  title,
                  siteFromUrl(canon),
                  data.image || null,
                  null,
                  null,
                  6,
                  null,
                  null,
                  data.markdown || null,
                  now
                );
                count++;
              }
            }
          } catch {
            // Skip invalid file
          }
        }
      } catch {
        // No sources dir
      }
    }
  } catch {
    // Non-fatal
  }
  return { migratedCount: count };
}

export function registerSourcesPlugin(): void {
  ensureSourcesSchema();
  // Perform background migration on registration
  void migrateLegacyCitySources().catch(() => {});

  // 1. sources.add capability
  defineCapability({
    plugin: "sources",
    name: "add",
    title: "Add Source",
    description: "Enriches a URL server-side (canonical form, dedupe, kind, title, image, site, date) and saves it to the city feed. The agent passes the URL; the server does the rest.",
    scope: "city",
    input: AddSourceInput,
    output: AddSourceOutput,
    emits: ["source.added"],
    risk: "external",
    handler: async (input, ctx) => {
      const { tinyfish } = await import("../discovery/tinyfish");
      const enriched = await enrichSource(input.url, {
        title: input.title,
        kind: input.kind,
        fetchMarkdown: async (u) => {
          const pages = await tinyfish.fetch([u]);
          return pages[0]?.markdown ?? null;
        },
      });
      if (!enriched.title) {
        return {
          ok: false as const,
          error: `No title could be verified for ${enriched.url}. Refusing to save an untitled source.`,
          retryable: false as const,
        };
      }
      const existing = db
        .query("SELECT * FROM sources WHERE city_id = ? AND url = ?")
        .get(input.cityId, enriched.url) as any;
      if (existing) {
        const row = rowFromDb(existing);
        return {
          ok: true as const,
          id: row.id,
          data: { ...row, deduped: true },
          // Nothing was added: stay silent so "added" is never emitted on dedupe
          events: [],
        };
      }
      const id = `src_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      const now = new Date().toISOString();
      db.query(
        `INSERT INTO sources (id, city_id, kind, url, title, site, image, author, published_at, read_minutes, duration_sec, hook, full_text, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id, input.cityId, enriched.kind, enriched.url, enriched.title, enriched.site,
        enriched.image, enriched.author, enriched.publishedAt, enriched.readMinutes,
        enriched.durationSec ?? null, null, enriched.fullText, now
      );
      const row = { ...(await Promise.resolve(getSourceById(id)))!, deduped: false };
      return { ok: true as const, id, data: row };
    },
  });

  // 2. sources.list capability
  defineCapability({
    plugin: "sources",
    name: "list",
    title: "List Sources",
    description: "Lists all sources saved for a city workspace.",
    scope: "city",
    input: z.object({
      cityId: z.string().min(1).describe("City workspace id"),
    }),
    output: z.object({
      cityId: z.string(),
      items: z.array(z.any()),
    }),
    emits: [],
    risk: "read",
    handler: async (input) => {
      const items = listSources(input.cityId);
      return { ok: true as const, data: { cityId: input.cityId, items } };
    },
  });

  // 3. sources.open capability
  defineCapability({
    plugin: "sources",
    name: "open",
    title: "Open Source",
    description: "Opens a saved source in the reader (articles/papers) or video view. Only works for sources already in the city feed.",
    scope: "city",
    input: z.object({
      id: z.string().describe("Source id from the city feed"),
      cityId: z.string().optional().describe("City workspace id (optional)"),
    }),
    output: z.object({
      id: z.string(),
      url: z.string(),
      kind: z.enum(["article", "paper", "video"]),
      title: z.string(),
    }),
    emits: ["reader.open"],
    risk: "read",
    handler: async (input, ctx) => {
      const row = getSourceById(input.id);
      const targetCity = input.cityId || ctx.cityId;
      if (!row || (targetCity && row.cityId !== targetCity)) {
        return {
          ok: false as const,
          error: `Source "${input.id}" not found. Save it first with sources.add.`,
          retryable: false as const,
        };
      }
      return {
        ok: true as const,
        id: row.id,
        data: { id: row.id, url: row.url, kind: row.kind, title: row.title, cityId: row.cityId },
      };
    },
  });
}
