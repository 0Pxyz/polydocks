import type { SearchHit } from "./tinyfish";

/**
 * Source quality gates for TinyFish research (#348).
 *
 * Pure, testable curation: every candidate gets a transparent kind tag,
 * primary sources (official docs, repos, papers, engineering blogs) rank
 * above SEO listicles and marketing pages, and the envelope says
 * explicitly which requested media types came back empty instead of
 * pretending full coverage. No model calls, no I/O.
 */

export type SourceKind = "article" | "video" | "paper" | "course";

export interface KindedHit extends SearchHit {
  kind: SourceKind;
  /** Why this candidate ranks where it does (primary, official, penalized…). */
  qualityNote?: string;
}

export interface CoverageNote {
  requested: SourceKind[];
  found: SourceKind[];
  missing: SourceKind[];
  /** Explicit limitation text when something requested came back empty. */
  note: string | null;
}

const VIDEO_HOSTS = ["youtube.com", "youtu.be", "vimeo.com"];
const COURSE_HOSTS = ["coursera.org", "udemy.com", "edx.org", "udacity.com", "pluralsight.com", "frontendmasters.com"];
const PAPER_HOSTS = ["arxiv.org", "doi.org", "semanticscholar.org", "acm.org", "ieeexplore.ieee.org", "openreview.net"];

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Transparent kind tag from URL shape and search domain (#348). */
export function classifySourceKind(url: string, domainType?: string): SourceKind {
  const host = hostOf(url);
  const lower = url.toLowerCase();
  if (VIDEO_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return "video";
  if (COURSE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return "course";
  if (
    PAPER_HOSTS.some((h) => host === h || host.endsWith(`.${h}`)) ||
    lower.includes("arxiv") ||
    /\.pdf([?#]|$)/.test(lower)
  ) {
    return "paper";
  }
  if (domainType === "research_paper") return "paper";
  return "article";
}

const DOCS_PATH = /\/(docs|documentation|reference|api|guide|guides|manual|handbook)(\/|$)/;
const SEO_TITLE =
  /\b(top\s+\d+|best\s+\S+\s+(of\s+)?20\d{2}|\d+\s+best|ultimate\s+guide|review\s+20\d{2}|coupon|promo\s*code|discount)\b/i;
const MARKETING_HOST = /\b(coupon|deals|promo|affiliate|clickbank|top10|top-10)\b/;
const AGGREGATOR_TITLE = /\b(top\s+\d+|best\b.+\b(apps?|tools?|sites?|courses?)\b)\b/i;

/**
 * Primary-source score: official docs, public repos, papers and .edu rank
 * up; SEO listicles, marketing hosts and aggregators rank down. Bounded
 * and explainable — the envelope carries the note, never a black box.
 */
export function scorePrimarySource(hit: Pick<SearchHit, "title" | "url">): { score: number; note: string } {
  const host = hostOf(hit.url);
  const title = hit.title || "";
  let score = 0;
  const reasons: string[] = [];

  if (DOCS_PATH.test(hit.url) || /^(docs|developer|developers|support)\./.test(host)) {
    score += 3;
    reasons.push("official docs");
  }
  if (host === "github.com" || host.endsWith(".github.io") || host === "gitlab.com") {
    score += 3;
    reasons.push("public repo");
  }
  if (PAPER_HOSTS.some((h) => host === h || host.endsWith(`.${h}`)) || host.endsWith(".edu")) {
    score += 3;
    reasons.push("paper/academic");
  }
  if (/^(engineering|eng|tech|research|blog)\./.test(host) || /\.engineering$/.test(host)) {
    score += 1;
    reasons.push("engineering blog");
  }
  if (SEO_TITLE.test(title)) {
    score -= 3;
    reasons.push("SEO listicle");
  }
  if (MARKETING_HOST.test(host)) {
    score -= 3;
    reasons.push("marketing host");
  } else if (AGGREGATOR_TITLE.test(title)) {
    score -= 2;
    reasons.push("aggregator");
  }
  return { score, note: reasons.join(", ") || "unclassified" };
}

/** Media types implied by a research query or an explicit domain. */
export function wantedKinds(query: string, domainType?: string): SourceKind[] {
  const q = query.toLowerCase();
  const wants: SourceKind[] = [];
  if (/\b(videos?|youtube|screencasts?|talks?|watch)\b/.test(q)) wants.push("video");
  if (/\b(papers?|arxiv|doi|research|academic|study|studies)\b/.test(q)) wants.push("paper");
  if (/\b(courses?|tutorials?|learn|udemy|coursera)\b/.test(q)) wants.push(domainType === "web" ? "course" : "article");
  if (domainType === "research_paper" && !wants.includes("paper")) wants.push("paper");
  return [...new Set(wants)];
}

/**
 * Curates one result page: kind-tags every hit, primary-sources-first
 * order (stable for ties), and an explicit coverage note naming the
 * requested media types that came back empty.
 */
export function curateSearchResults(
  hits: SearchHit[],
  query: string,
  domainType?: string
): { results: KindedHit[]; coverage: CoverageNote } {
  const kinded: KindedHit[] = hits.map((h) => {
    const kind = classifySourceKind(h.url, h.domainType || domainType);
    const { score, note } = scorePrimarySource(h);
    return { ...h, kind, qualityNote: `${note} (${score >= 0 ? "+" : ""}${score})`, __score: score } as KindedHit & {
      __score: number;
    };
  });
  const indexed = kinded.map((h, i) => ({ h, i }));
  indexed.sort((a, b) => (b.h as any).__score - (a.h as any).__score || a.i - b.i);
  const results = indexed.map(({ h }) => {
    const { __score: _drop, ...clean } = h as any;
    return clean as KindedHit;
  });

  const requested = wantedKinds(query, domainType);
  const found = [...new Set(results.map((r) => r.kind))];
  const missing = requested.filter((k) => !found.includes(k));
  return {
    results,
    coverage: {
      requested,
      found,
      missing,
      note:
        missing.length > 0
          ? `No ${missing.join("/")} sources found for this query — the results below do not cover ${missing.join("/")} despite the request. Say so explicitly instead of implying full coverage.`
          : null,
    },
  };
}
