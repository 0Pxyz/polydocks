import { describe, it, expect } from "bun:test";
import {
  classifySourceKind,
  scorePrimarySource,
  wantedKinds,
  curateSearchResults,
} from "../server/discovery/sourceQuality";
import type { SearchHit } from "../server/discovery/tinyfish";

function hit(title: string, url: string): SearchHit {
  return { title, url, domainType: "web" };
}

/**
 * Research quality gates (#348): kind tags, primary-first ranking, SEO
 * penalty, and explicit missing-media notes instead of implied coverage.
 */
describe("source quality gates (#348)", () => {
  it("tags video, paper and course URLs by shape", () => {
    expect(classifySourceKind("https://www.youtube.com/watch?v=abc")).toBe("video");
    expect(classifySourceKind("https://youtu.be/abc")).toBe("video");
    expect(classifySourceKind("https://vimeo.com/123")).toBe("video");
    expect(classifySourceKind("https://arxiv.org/abs/2101.12345")).toBe("paper");
    expect(classifySourceKind("https://example.com/paper.pdf")).toBe("paper");
    expect(classifySourceKind("https://www.coursera.org/learn/x")).toBe("course");
    expect(classifySourceKind("https://example.com/blog/post")).toBe("article");
    expect(classifySourceKind("https://example.com/anything", "research_paper")).toBe("paper");
  });

  it("scores docs/repos/papers up and SEO/marketing down", () => {
    const docs = scorePrimarySource(hit("Raft", "https://raft.github.io/raft.pdf"));
    const repo = scorePrimarySource(hit("Raft", "https://github.com/raft/raft"));
    const academic = scorePrimarySource(hit("Raft", "https://arxiv.org/abs/1234"));
    const seo = scorePrimarySource(hit("Top 10 Best Raft Courses of 2026", "https://example.com/top-10"));
    const marketing = scorePrimarySource(hit("Raft", "https://coupon-deals.example.com/raft"));
    expect(docs.score).toBeGreaterThan(0);
    expect(repo.score).toBeGreaterThan(0);
    expect(academic.score).toBeGreaterThan(0);
    expect(seo.score).toBeLessThan(0);
    expect(marketing.score).toBeLessThan(0);
    expect(seo.note).toMatch(/SEO|aggregator/i);
  });

  it("sorts primary sources first, stable for ties", () => {
    const { results } = curateSearchResults(
      [
        hit("Top 10 Best Databases 2026", "https://example.com/top-10"),
        hit("PostgreSQL Documentation", "https://www.postgresql.org/docs/current/index.html"),
        hit("Another listicle", "https://example.com/best-dbs"),
      ],
      "postgres docs",
      "web"
    );
    expect(results[0].url).toContain("postgresql.org");
    expect(results[0].kind).toBe("article");
    expect(results[0].qualityNote).toMatch(/official docs/);
  });

  it("names requested media types that came back empty", () => {
    const { coverage } = curateSearchResults(
      [hit("Raft paper", "https://arxiv.org/abs/1234")],
      "raft consensus videos and papers",
      "web"
    );
    expect(coverage.requested).toContain("video");
    expect(coverage.missing).toEqual(["video"]);
    expect(coverage.note).toMatch(/No video sources found/);
  });

  it("stays silent when coverage is complete", () => {
    const { coverage } = curateSearchResults(
      [hit("Talk", "https://www.youtube.com/watch?v=x"), hit("Paper", "https://arxiv.org/abs/1")],
      "raft videos and papers",
      "web"
    );
    expect(coverage.missing).toEqual([]);
    expect(coverage.note).toBeNull();
  });

  it("detects wanted kinds from query and domain", () => {
    expect(wantedKinds("funny cat videos", "web")).toContain("video");
    expect(wantedKinds("transformer architecture", "research_paper")).toContain("paper");
    expect(wantedKinds("learn rust", "web")).toContain("course");
  });
});
