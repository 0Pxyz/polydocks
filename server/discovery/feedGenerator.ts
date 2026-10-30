import { tinyfish } from "./tinyfish";
import { writeCityFile } from "../workspace/cityWorkspace";
import { db } from "../workspace/db";

export interface CityFeedItem {
  id: string;
  title: string;
  url: string;
  kind: "paper" | "video" | "guide" | "article" | "news";
  summary: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  readTimeMinutes: number;
  tags: string[];
  authorOrSource?: string;
  questTitle?: string;
}

export interface CityFeed {
  cityId: string;
  topic: string;
  updatedAt: string;
  items: CityFeedItem[];
}

/**
 * Automatically researches a city's topic using TinyFish and generates a curated feed.
 */
export async function generateCityFeed(
  cityId: string,
  topic: string
): Promise<CityFeed> {
  const cleanTopic = topic.trim();
  if (!cleanTopic) {
    throw new Error("Cannot generate city feed without a valid topic");
  }

  // 1. Concurrently search across research papers, web tutorials, and news
  const [papers, webGuides, newsHits] = await Promise.all([
    tinyfish.search(`${cleanTopic} foundational paper`, "research_paper", 3),
    tinyfish.search(`${cleanTopic} visual interactive tutorial`, "web", 3),
    tinyfish.search(`${cleanTopic} breakthroughs announcements`, "news", 2),
  ]);

  const items: CityFeedItem[] = [];

  // Map papers
  papers.forEach((p, idx) => {
    items.push({
      id: `paper-${idx + 1}-${encodeURIComponent(p.title.slice(0, 20).toLowerCase().replace(/\s+/g, "-"))}`,
      title: p.title,
      url: p.url,
      kind: "paper",
      summary: p.snippet || "Primary academic research paper detailing core theoretical foundations.",
      difficulty: idx === 0 ? "intermediate" : "advanced",
      readTimeMinutes: 30 + idx * 10,
      tags: ["paper", "academic", cleanTopic.toLowerCase()],
      questTitle: `Read & Summarize: ${p.title.slice(0, 40)}`,
    });
  });

  // Map web tutorials & guides
  webGuides.forEach((g, idx) => {
    const isVideo = g.url.includes("youtube.com") || g.url.includes("youtu.be");
    items.push({
      id: `guide-${idx + 1}-${encodeURIComponent(g.title.slice(0, 20).toLowerCase().replace(/\s+/g, "-"))}`,
      title: g.title,
      url: g.url,
      kind: isVideo ? "video" : "guide",
      summary: g.snippet || "Interactive walkthrough and foundational guide.",
      difficulty: "beginner",
      readTimeMinutes: isVideo ? 15 : 10,
      tags: [isVideo ? "video" : "guide", "practical", cleanTopic.toLowerCase()],
      questTitle: `Complete Tutorial: ${g.title.slice(0, 40)}`,
    });
  });

  // Map recent news
  newsHits.forEach((n, idx) => {
    items.push({
      id: `news-${idx + 1}`,
      title: n.title,
      url: n.url,
      kind: "news",
      summary: n.snippet || "Recent announcement and industry developments.",
      difficulty: "beginner",
      readTimeMinutes: 5,
      tags: ["news", "industry"],
      questTitle: `Review Industry Update: ${n.title.slice(0, 30)}`,
    });
  });

  const feed: CityFeed = {
    cityId,
    topic: cleanTopic,
    updatedAt: new Date().toISOString(),
    items,
  };

  // 2. Persist to city workspace: workspace/<cityId>/feed.json (legacy
  // compat reader: GET /api/cities/:id/feed. The canonical store is the
  // `sources` table below).
  await writeCityFile(cityId, "feed.json", JSON.stringify(feed, null, 2));

  // 3. Canonical store: one validated row per URL in the `sources` table
  // (dedupe on (city_id, url)). Feed UI and sources.* capabilities read this
  // table — never filenames, never raw feed.json, never city_sources.
  const { canonicalizeUrl, siteFromUrl, inferKind, ensureSourcesSchema } = await import("../plugins/sources");
  ensureSourcesSchema();
  const now = new Date().toISOString();
  for (const item of items) {
    try {
      const url = canonicalizeUrl(item.url);
      const kind = inferKind(url, item.kind === "guide" || item.kind === "news" ? undefined : item.kind);
      const id = `src_feed_${Math.abs(hashCode(url + cityId)).toString(36)}`;
      db.query(
        `INSERT OR IGNORE INTO sources (id, city_id, kind, url, title, site, image, author, published_at, read_minutes, duration_sec, hook, full_text, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        cityId,
        kind,
        url,
        item.title,
        siteFromUrl(url),
        null,
        item.authorOrSource || null,
        null,
        item.readTimeMinutes ?? null,
        null,
        item.summary || null,
        null,
        now
      );
    } catch {
      // Non-fatal: feed.json above still carries the items.
    }
  }

  return feed;
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h;
}
