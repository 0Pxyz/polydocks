import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { invoke_capability } from "../server/agent/tools/invoke_capability";
import { find_capabilities } from "../server/agent/tools/find_capabilities";
import { runContractCommand } from "../server/plugins/contractCli";
import { getContractCapability } from "../server/plugins/contract";
import { db } from "../server/workspace/db";
import { migrateLegacyCitySources, listSources } from "../server/plugins/sources";
import app from "../server/index";

const CITY = "test-sources-ws";
const ARTICLE_URL = "https://example.com/articles/deep-work";
const VIDEO_URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const VIMEO_URL = "https://vimeo.com/76979871";
const NO_TITLE_URL = "https://example.com/empty-page";
const MD_IMAGE_URL = "https://example.com/md-image-article";

const OG_HTML = `<html><head>
<meta property="og:title" content="Deep Work Rules" />
<meta property="og:image" content="https://example.com/img/deep.jpg" />
<meta property="og:description" content="Focus in a distracted world." />
<meta property="article:published_time" content="2024-03-01T00:00:00Z" />
<title>Fallback Title</title>
</head><body><h1>Deep Work</h1><p>${"word ".repeat(400)}</p></body></html>`;

const NO_OG_HTML = `<html><head></head><body><p>Article body</p></body></html>`;
const EMPTY_HTML = `<html><head></head><body><p>nothing here</p></body></html>`;

const realFetch = globalThis.fetch;

/** Hermetic network: oEmbed, og pages, TinyFish endpoints. */
function stubFetch() {
  (globalThis as any).fetch = async (url: any, init?: any) => {
    const u = String(url);
    if (u.includes("youtube.com/oembed")) {
      return Response.json({ title: "Test Video", author_name: "Tester", thumbnail_url: "https://i.ytimg.com/vi/x/hqdefault.jpg" });
    }
    if (u.includes("vimeo.com/api/oembed.json") || u.includes("vimeo.com/oembed")) {
      return Response.json({ title: "Vimeo Video", author_name: "Filmmaker", thumbnail_url: "https://i.vimeocdn.com/video/123.jpg" });
    }
    if (u === NO_TITLE_URL) {
      return new Response(EMPTY_HTML, { headers: { "Content-Type": "text/html" } });
    }
    if (u === ARTICLE_URL) {
      return new Response(OG_HTML, { headers: { "Content-Type": "text/html" } });
    }
    if (u === MD_IMAGE_URL) {
      return new Response(NO_OG_HTML, { headers: { "Content-Type": "text/html" } });
    }
    if (u.includes("api.fetch.tinyfish.ai")) {
      const body = (() => { try { return JSON.parse((init as any)?.body || "{}"); } catch { return {}; } })();
      const urls: string[] = Array.isArray(body.urls) ? body.urls : [];
      const results = urls.map((pageUrl: string) => {
        if (pageUrl === NO_TITLE_URL) return { url: pageUrl, status: 200, markdown: "just some words with no heading" };
        if (pageUrl === MD_IMAGE_URL) return { url: pageUrl, status: 200, markdown: "# Markdown Extracted Title\n\n![Hero](https://example.com/from-markdown.png)\n\n" + "word ".repeat(100) };
        return { url: pageUrl, status: 200, markdown: "# Deep Work\n\n" + "word ".repeat(100) };
      });
      return Response.json({ results });
    }
    if (u.includes("api.search.tinyfish.ai")) {
      return Response.json({ results: [] });
    }
    return realFetch(url, init);
  };
}

describe("Sources Plugin & First-Party Capabilities", () => {
  beforeEach(() => {
    stubFetch();
    db.query("DELETE FROM sources WHERE city_id = ?").run(CITY);
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    db.query("DELETE FROM sources WHERE city_id = ?").run(CITY);
  });

  it("registers sources capabilities on the bus and contract registry", async () => {
    expect(getContractCapability("sources", "add")).toBeDefined();
    expect(getContractCapability("sources", "list")).toBeDefined();
    expect(getContractCapability("sources", "open")).toBeDefined();

    const found = (await find_capabilities.execute({ query: "add a web source" }, { step: 1 } as any)) as any;
    const ids: string[] = (found.capabilities || found || []).map((c: any) => c.id ?? c);
    expect(ids).toContain("sources.add");
  });

  it("agent tool, HTTP route and CLI return the same envelope and event", async () => {
    const input = { url: ARTICLE_URL, cityId: CITY };

    // 1. Agent surface: sources.add
    const viaAgent = (await invoke_capability.execute({ id: "sources.add", input }, { step: 1 } as any)) as any;
    expect(viaAgent.success).toBe(true);
    const agentEnv = viaAgent.data;
    expect(agentEnv.ok).toBe(true);
    expect(agentEnv.data.title).toBe("Deep Work Rules");
    expect(agentEnv.data.image).toBe("https://example.com/img/deep.jpg");
    expect(agentEnv.data.site).toBe("example.com");
    expect(agentEnv.events.some((e: any) => e.type === "source.added")).toBe(true);
    const savedId = agentEnv.id as string;
    expect(typeof savedId).toBe("string");

    // 2. HTTP surface: POST /api/plugins/sources/add (dedupe path, same id, no duplicate event)
    const httpRes = await app.fetch(
      new Request("http://localhost/api/plugins/sources/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input }),
      })
    );
    const httpEnv = (await httpRes.json()) as any;
    expect(httpEnv.ok).toBe(true);
    expect(httpEnv.id).toBe(savedId);
    expect(httpEnv.data.deduped).toBe(true);
    expect(httpEnv.events.some((e: any) => e.type === "source.added")).toBe(false);

    // 3. CLI surface: polydocks sources add --url ... --city ...
    const cli = await runContractCommand("sources", "add", ["--url", ARTICLE_URL, "--city", CITY], { json: true });
    expect(cli.found).toBe(true);
    expect((cli.envelope as any)?.ok).toBe(true);
    expect((cli.envelope as any)?.id).toBe(savedId);

    // One row only in database: dedupe held across all three surfaces
    const count = db.query("SELECT COUNT(*) as n FROM sources WHERE city_id = ?").get(CITY) as any;
    expect(count.n).toBe(1);
  });

  it("infers video kind with thumbnail via YouTube oEmbed", async () => {
    const res = (await invoke_capability.execute(
      { id: "sources.add", input: { url: VIDEO_URL, cityId: CITY } },
      { step: 1 } as any
    )) as any;
    expect(res.success).toBe(true);
    expect(res.data.ok).toBe(true);
    expect(res.data.data.kind).toBe("video");
    expect(res.data.data.image).toContain("ytimg.com");
  });

  it("handles Vimeo video with thumbnail and oEmbed author/title", async () => {
    const res = (await invoke_capability.execute(
      { id: "sources.add", input: { url: VIMEO_URL, cityId: CITY } },
      { step: 1 } as any
    )) as any;
    expect(res.success).toBe(true);
    expect(res.data.ok).toBe(true);
    expect(res.data.data.kind).toBe("video");
    expect(res.data.data.title).toBe("Vimeo Video");
    expect(res.data.data.author).toBe("Filmmaker");
    expect(res.data.data.image).toContain("vimeocdn.com");
  });

  it("falls back to markdown heading and markdown image when og tags missing", async () => {
    const res = (await invoke_capability.execute(
      { id: "sources.add", input: { url: MD_IMAGE_URL, cityId: CITY } },
      { step: 1 } as any
    )) as any;
    expect(res.success).toBe(true);
    expect(res.data.ok).toBe(true);
    expect(res.data.data.title).toBe("Markdown Extracted Title");
    expect(res.data.data.image).toBe("https://example.com/from-markdown.png");
  });

  it("lists sources via sources.list and opens a source via sources.open", async () => {
    // 1. Add source
    const added = (await invoke_capability.execute(
      { id: "sources.add", input: { url: ARTICLE_URL, cityId: CITY } },
      { step: 1 } as any
    )) as any;
    expect(added.data.ok).toBe(true);
    const sourceId = added.data.id;

    // 2. sources.list({ cityId })
    const listRes = (await invoke_capability.execute(
      { id: "sources.list", input: { cityId: CITY } },
      { step: 1 } as any
    )) as any;
    expect(listRes.success).toBe(true);
    expect(listRes.data.ok).toBe(true);
    expect(listRes.data.data.items.length).toBeGreaterThan(0);
    expect(listRes.data.data.items.some((s: any) => s.id === sourceId)).toBe(true);

    // 3. sources.open({ id })
    const openRes = (await invoke_capability.execute(
      { id: "sources.open", input: { id: sourceId, cityId: CITY } },
      { step: 1 } as any
    )) as any;
    expect(openRes.success).toBe(true);
    expect(openRes.data.ok).toBe(true);
    expect(openRes.data.data.id).toBe(sourceId);
    expect(openRes.data.events.some((e: any) => e.type === "reader.open")).toBe(true);
  });

  it("rejects sources without a verifiable title", async () => {
    const res = (await invoke_capability.execute(
      { id: "sources.add", input: { url: NO_TITLE_URL, cityId: CITY } },
      { step: 1 } as any
    )) as any;
    expect(res.data?.ok ?? res.success).toBe(false);
    const rows = db.query("SELECT COUNT(*) as n FROM sources WHERE city_id = ?").get(CITY) as any;
    expect(rows.n).toBe(0);
  });

  it("migrates existing city workspace feed.json and sources into SQLite sources table", async () => {
    const res = await migrateLegacyCitySources();
    expect(typeof res.migratedCount).toBe("number");
    const sources = listSources("neural-networks");
    expect(sources.length).toBeGreaterThan(0);
    expect(sources.some((s) => s.url.includes("nature.com") || s.title.includes("Deep Learning"))).toBe(true);
  });
});
