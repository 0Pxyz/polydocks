import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import { db } from "../workspace/db";
import { defineCapability } from "./contract";
import { validateUrlForSsrf } from "./ssrf";
import {
  thumbnailForUrl,
  videoEmbedUrl,
  vimeoId,
  vimeoThumbnail,
  youtubeId,
  youtubeThumbnail,
} from "../video/ids";

// Public surface kept for existing consumers (tests, reader contract).
export { videoEmbedUrl } from "../video/ids";

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
  workspace_id TEXT NOT NULL,
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
  UNIQUE(workspace_id, url)
);
`;

export function ensureSourcesSchema(): void {
  db.exec(SOURCES_TABLE_SQL);
}

export type SourceKind = "article" | "paper" | "video";

export interface SourceRow {
  id: string;
  workspaceId: string;
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
          image: meta.thumbnail_url || youtubeThumbnail(yt),
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
      image: youtubeThumbnail(yt),
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
          image: meta.thumbnail_url || vimeoThumbnail(vm),
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
      image: vimeoThumbnail(vm),
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

export type ReaderMode = "video" | "reader" | "embed" | "external";

export interface ResolvedOpen {
  mode: ReaderMode;
  /** Official embed URL for video/embed modes. */
  embedUrl?: string;
  /** Saved markdown for reader mode. */
  markdown?: string;
  /** Human-readable reason for external mode. */
  reason?: string;
}

/**
 * HEAD check for frame embedding: DENY/SAMEORIGIN x-frame-options or a
 * restrictive frame-ancestors CSP means the host forbids iframes.
 * Absent headers mean allowed (browser default). Network failure or an
 * inconclusive response is NOT permission — fall through to reader/external.
 */
export async function checkFramingAllowed(rawUrl: string): Promise<boolean> {
  const ssrf = validateUrlForSsrf(rawUrl);
  if (!ssrf.safe || !ssrf.url) return false;
  try {
    const res = await fetch(ssrf.url.toString(), {
      method: "HEAD",
      signal: AbortSignal.timeout(8000),
      redirect: "follow",
    });
    if (!res.ok) return false;
    const xfo = (res.headers.get("x-frame-options") || "").toLowerCase();
    if (xfo.includes("deny") || xfo.includes("sameorigin")) return false;
    const csp = (res.headers.get("content-security-policy") || "").toLowerCase();
    const fa = csp.split(";").map((d) => d.trim()).find((d) => d.startsWith("frame-ancestors"));
    if (fa && (fa.includes("'none'") || (fa.includes("'self'") && !fa.includes("https:")))) return false;
    return true;
  } catch {
    return false;
  }
}

function isPdfLike(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.pathname.toLowerCase().endsWith(".pdf")) return true;
    const host = u.hostname.toLowerCase();
    if (host === "arxiv.org" || host.endsWith(".arxiv.org")) return u.pathname.includes("/pdf/");
    return false;
  } catch {
    return false;
  }
}

/**
 * Decides how a saved source opens — pure except for the PDF framing
 * check. No silent fallbacks: every branch names its mode. Video embeds
 * always work (official players); articles read from the saved markdown
 * (never an iframe, so frame-blockers cannot break them); PDFs embed
 * only when the host permits; otherwise an explicit external state
 * tells the user to open the original.
 */
export async function resolveSourceMode(row: Pick<SourceRow, "url" | "kind" | "fullText">): Promise<ResolvedOpen> {
  const embed = videoEmbedUrl(row.url);
  if (row.kind === "video" && embed) {
    return { mode: "video", embedUrl: embed };
  }
  if (isPdfLike(row.url)) {
    if (await checkFramingAllowed(row.url)) {
      return { mode: "embed", embedUrl: row.url };
    }
    if (row.fullText && row.fullText.trim().length > 0) {
      return { mode: "reader", markdown: row.fullText };
    }
    return { mode: "external", reason: "This PDF blocks embedding and no readable text was saved. Open the original to read it." };
  }
  if (row.fullText && row.fullText.trim().length > 0) {
    return { mode: "reader", markdown: row.fullText };
  }
  return {
    mode: "external",
    reason: "No readable text was saved for this source. Open the original to read it.",
  };
}

function rowFromDb(r: any): SourceRow {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
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

export function listSources(workspaceId: string): SourceRow[] {
  ensureSourcesSchema();
  const rows = db
    .query("SELECT * FROM sources WHERE workspace_id = ? ORDER BY created_at ASC")
    .all(workspaceId) as any[];
  return rows.map(rowFromDb);
}

export const AddSourceInput = z.object({
  url: z.string().url().describe("Source URL to enrich and save"),
  workspaceId: z.string().min(1).describe("Workspace id"),
  title: z.string().optional().describe("Optional title override (verified against the page)"),
  kind: z.enum(["article", "paper", "video"]).optional().describe("Optional kind override"),
});

export const AddSourceOutput = z.object({
  id: z.string(),
  workspaceId: z.string(),
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
 * Migrates existing workspace data (feed.json and sources/*.json) into
 * the SQLite sources table so the feed never has to read raw files.
 */
export async function migrateLegacyWorkspaceSources(): Promise<{ migratedCount: number }> {
  ensureSourcesSchema();
  const workspaceRoot = path.resolve(process.cwd(), "workspace");
  let count = 0;
  try {
    const entries = await fs.readdir(workspaceRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      const workspaceId = entry.name;

      // 1. Check feed.json
      try {
        const feedPath = path.join(workspaceRoot, workspaceId, "feed.json");
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
            .query("SELECT id FROM sources WHERE workspace_id = ? AND url = ?")
            .get(workspaceId, canon);
          if (!existing) {
            const id = `src_mig_${workspaceId.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_${Math.random().toString(36).slice(2, 8)}`;
            const kind = inferKind(canon, item.kind);
            const site = siteFromUrl(canon);
            const now = new Date().toISOString();
            db.query(
              `INSERT OR IGNORE INTO sources (id, workspace_id, kind, url, title, site, image, author, published_at, read_minutes, duration_sec, hook, full_text, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).run(
              id,
              workspaceId,
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
        const sourcesDir = path.join(workspaceRoot, workspaceId, "sources");
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
                .query("SELECT id FROM sources WHERE workspace_id = ? AND url = ?")
                .get(workspaceId, canon);
              if (!existing) {
                const id = `src_mig_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
                const kind = inferKind(canon, data.kind);
                const title =
                  data.title ||
                  (data.markdown ? firstHeading(data.markdown) : null) ||
                  file.name.replace(/\.json$/, "").replace(/_/g, " ");
                const now = new Date().toISOString();
                db.query(
                  `INSERT OR IGNORE INTO sources (id, workspace_id, kind, url, title, site, image, author, published_at, read_minutes, duration_sec, hook, full_text, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
                ).run(
                  id,
                  workspaceId,
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

/**
 * Backfills thumbnails for saved video rows that predate server-side
 * enrichment (legacy `src_mig_*` rows carry image NULL): derives the
 * thumbnail from the URL id alone, never touching rows that already
 * have an image or non-video rows.
 */
export function backfillVideoThumbnails(): { filledCount: number } {
  ensureSourcesSchema();
  let filled = 0;
  try {
    const rows = db
      .query("SELECT id, url FROM sources WHERE kind = 'video' AND (image IS NULL OR image = '')")
      .all() as Array<{ id: string; url: string }>;
    for (const row of rows) {
      const thumb = thumbnailForUrl(row.url);
      if (!thumb) continue;
      db.query("UPDATE sources SET image = ? WHERE id = ?").run(thumb, row.id);
      filled++;
    }
  } catch {
    // Non-fatal: feed renders a derived thumbnail anyway.
  }
  return { filledCount: filled };
}

export function registerSourcesPlugin(): void {
  ensureSourcesSchema();
  // Perform background migration on registration
  void migrateLegacyWorkspaceSources().catch(() => {});
  backfillVideoThumbnails();

  // 1. sources.add capability
  defineCapability({
    plugin: "sources",
    name: "add",
    title: "Add Source",
    description: "Enriches a URL server-side (canonical form, dedupe, kind, title, image, site, date) and saves it to the workspace feed. The agent passes the URL; the server does the rest.",
    scope: "workspace",
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
        .query("SELECT * FROM sources WHERE workspace_id = ? AND url = ?")
        .get(input.workspaceId, enriched.url) as any;
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
        `INSERT INTO sources (id, workspace_id, kind, url, title, site, image, author, published_at, read_minutes, duration_sec, hook, full_text, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id, input.workspaceId, enriched.kind, enriched.url, enriched.title, enriched.site,
        enriched.image, enriched.author, enriched.publishedAt, enriched.readMinutes,
        enriched.durationSec ?? null, null, enriched.fullText, now
      );
      const row = { ...(await Promise.resolve(getSourceById(id)))!, deduped: false };
      return { ok: true as const, id, data: row };
    },
  });

  // 2. sources.import capability: full-field insert with zero network
  // (no oEmbed, no fetch, no enrichment). For local fixtures and bookmark
  // imports where every field is already known. Dedupes by URL like add.
  defineCapability({
    plugin: "sources",
    name: "import",
    title: "Import Source",
    description:
      "Saves a fully-described source to the workspace feed without any network enrichment. The caller provides every field (title, kind, content).",
    scope: "workspace",
    input: z.object({
      workspaceId: z.string().min(1).describe("Workspace id"),
      url: z.string().url().describe("Source URL"),
      kind: z.enum(["article", "paper", "video"]).describe("Source kind"),
      title: z.string().min(1).describe("Source title"),
      site: z.string().optional().describe("Site name"),
      image: z.string().nullable().optional().describe("Image URL"),
      author: z.string().nullable().optional().describe("Author name"),
      publishedAt: z.string().nullable().optional().describe("ISO publish date"),
      readMinutes: z.number().nullable().optional().describe("Read time in minutes"),
      durationSec: z.number().nullable().optional().describe("Video duration in seconds"),
      hook: z.string().nullable().optional().describe("One-line hook"),
      fullText: z.string().nullable().optional().describe("Bundled markdown content"),
    }),
    output: AddSourceOutput,
    emits: ["source.added"],
    risk: "write",
    handler: async (input) => {
      const existing = db
        .query("SELECT * FROM sources WHERE workspace_id = ? AND url = ?")
        .get(input.workspaceId, input.url) as any;
      if (existing) {
        const row = rowFromDb(existing);
        return { ok: true as const, id: row.id, data: { ...row, deduped: true }, events: [] };
      }
      const id = `src_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      const now = new Date().toISOString();
      db.query(
        `INSERT INTO sources (id, workspace_id, kind, url, title, site, image, author, published_at, read_minutes, duration_sec, hook, full_text, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id, input.workspaceId, input.kind, input.url, input.title,
        input.site ?? siteFromUrl(input.url), input.image ?? null, input.author ?? null,
        input.publishedAt ?? null, input.readMinutes ?? null, input.durationSec ?? null,
        input.hook ?? null, input.fullText ?? null, now
      );
      const row = { ...(await Promise.resolve(getSourceById(id)))!, deduped: false };
      return { ok: true as const, id, data: row };
    },
  });

  // 3. sources.remove capability: deletes a workspace source by id.
  defineCapability({
    plugin: "sources",
    name: "remove",
    title: "Remove Source",
    description: "Deletes one saved source from the workspace feed by id.",
    scope: "workspace",
    input: z.object({
      id: z.string().min(1).describe("Source id from the workspace feed"),
      workspaceId: z.string().optional().describe("Workspace id (optional)"),
    }),
    output: z.object({ id: z.string(), removed: z.boolean() }),
    emits: [],
    risk: "write",
    handler: async (input, ctx) => {
      const row = getSourceById(input.id);
      const targetWorkspace = input.workspaceId || ctx.workspaceId;
      if (!row || (targetWorkspace && row.workspaceId !== targetWorkspace)) {
        return { ok: false as const, error: `Source "${input.id}" not found.`, retryable: false as const };
      }
      db.query("DELETE FROM sources WHERE id = ?").run(input.id);
      return { ok: true as const, id: input.id, data: { id: input.id, removed: true } };
    },
  });

  // 4. sources.list capability
  defineCapability({
    plugin: "sources",
    name: "list",
    title: "List Sources",
    description: "Lists all sources saved for a workspace.",
    scope: "workspace",
    input: z.object({
      workspaceId: z.string().min(1).describe("Workspace id"),
    }),
    output: z.object({
      workspaceId: z.string(),
      items: z.array(z.any()),
    }),
    emits: [],
    risk: "read",
    handler: async (input) => {
      const items = listSources(input.workspaceId);
      return { ok: true as const, data: { workspaceId: input.workspaceId, items } };
    },
  });

  // 3. sources.open capability
  defineCapability({
    plugin: "sources",
    name: "open",
    title: "Open Source",
    description: "Decides how a saved source opens (video embed, in-app reader, framed PDF, or explicit external state) and emits reader.open. Only works for sources already in the workspace feed. Never opens a new tab by itself.",
    scope: "workspace",
    input: z.object({
      id: z.string().describe("Source id from the workspace feed"),
      workspaceId: z.string().optional().describe("Workspace id (optional)"),
    }),
    output: z.object({
      id: z.string(),
      url: z.string(),
      kind: z.enum(["article", "paper", "video"]),
      title: z.string(),
      workspaceId: z.string(),
      mode: z.enum(["video", "reader", "embed", "external"]),
      embedUrl: z.string().nullable().optional(),
      markdown: z.string().nullable().optional(),
      reason: z.string().nullable().optional(),
    }),
    emits: ["reader.open"],
    risk: "read",
    handler: async (input, ctx) => {
      const row = getSourceById(input.id);
      const targetWorkspace = input.workspaceId || ctx.workspaceId;
      if (!row || (targetWorkspace && row.workspaceId !== targetWorkspace)) {
        return {
          ok: false as const,
          error: `Source "${input.id}" not found. Save it first with sources.add.`,
          retryable: false as const,
        };
      }
      const resolved = await resolveSourceMode(row);
      return {
        ok: true as const,
        id: row.id,
        data: {
          id: row.id,
          url: row.url,
          kind: row.kind,
          title: row.title,
          workspaceId: row.workspaceId,
          image: row.image,
          site: row.site,
          publishedAt: row.publishedAt,
          ...resolved,
        },
      };
    },
  });
}
