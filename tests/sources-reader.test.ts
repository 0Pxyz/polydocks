import { describe, it, expect, beforeEach, afterEach, beforeAll } from "bun:test";
import { resolveSourceMode, videoEmbedUrl, backfillVideoThumbnails } from "../server/plugins/sources";
import { htmlToMarkdown } from "../server/reader/service";
import { adaptBackendEvent } from "../src/lib/agent/events";
import { useConversationStore, applyReaderOpened } from "../src/lib/agent/conversationStore";
import { invoke_capability } from "../server/agent/tools/invoke_capability";
import { PluginRegistry } from "../server/plugins/registry";
import { initializeFirstPartyPlugins } from "../server/plugins/first-party/index";
import { db } from "../server/workspace/db";

const CITY = "test-reader-ws";
const realFetch = globalThis.fetch;

function stubFetch(headMode: "allow" | "deny" | "fail" = "allow") {
  (globalThis as any).fetch = async (url: any, init?: any) => {
    const s = String(url);
    if (init?.method === "HEAD") {
      if (headMode === "fail") throw new Error("network down");
      const headers: Record<string, string> = headMode === "deny"
        ? { "x-frame-options": "DENY" }
        : {};
      return new Response(null, { status: 200, headers });
    }
    throw new Error("unexpected fetch " + s);
  };
}

describe("sources.open modes (no silent fallbacks)", () => {
  beforeAll(() => {
    initializeFirstPartyPlugins();
  });
  beforeEach(() => {
    stubFetch("allow");
    db.query("DELETE FROM sources WHERE city_id = ?").run(CITY);
    PluginRegistry.getInstance().recordGrant("sources", "read", `city:${CITY}`, "allow_always");
    PluginRegistry.getInstance().recordGrant("sources", "write", `city:${CITY}`, "allow_always");
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    db.query("DELETE FROM sources WHERE city_id = ?").run(CITY);
    db.query("DELETE FROM plugin_grants WHERE plugin_id = 'sources'").run();
  });

  it("video opens in the official embed (never an iframe crapshoot)", () => {
    expect(videoEmbedUrl("https://www.youtube.com/watch?v=abc123XYZ-_")).toBe(
      "https://www.youtube.com/embed/abc123XYZ-_?rel=0&modestbranding=1&playsinline=1"
    );
    expect(videoEmbedUrl("https://vimeo.com/123456789")).toBe("https://player.vimeo.com/video/123456789");
  });

  it("article with saved text opens in the reader with its markdown", async () => {
    const r = await resolveSourceMode({
      url: "https://example.com/a",
      kind: "article",
      fullText: "# Title\n\nBody text here.",
    });
    expect(r.mode).toBe("reader");
    expect(r.markdown).toContain("Body text");
  });

  it("PDF embeds only when the host permits framing, else reader, else external with reason", async () => {
    const pdf = "https://example.com/paper.pdf";
    const allowed = await resolveSourceMode({ url: pdf, kind: "paper", fullText: null });
    expect(allowed.mode).toBe("embed");
    expect(allowed.embedUrl).toBe(pdf);

    stubFetch("deny");
    const deniedWithText = await resolveSourceMode({ url: pdf, kind: "paper", fullText: "# Paper\n\ntext" });
    expect(deniedWithText.mode).toBe("reader");

    const deniedNoText = await resolveSourceMode({ url: pdf, kind: "paper", fullText: null });
    expect(deniedNoText.mode).toBe("external");
    expect(typeof deniedNoText.reason).toBe("string");
  });

  it("article without saved text is explicit external, never a fake success", async () => {
    const r = await resolveSourceMode({ url: "https://example.com/a", kind: "article", fullText: null });
    expect(r.mode).toBe("external");
    expect(typeof r.reason).toBe("string");
  });

  it("strips scripts, event handlers and javascript: links", () => {
    const { markdown } = htmlToMarkdown(
      `<html><head><title>T</title><script>alert(1)</script></head><body><h1 onclick="evil()">Hi</h1><p>See <a href="javascript:alert(2)">x</a> and <a href="https://example.com/a">y</a></p><img src="x" onerror="evil()"></body></html>`
    );
    expect(markdown).not.toContain("alert");
    expect(markdown).not.toContain("onerror");
    expect(markdown).not.toContain("javascript:");
    expect(markdown).toContain("[y](https://example.com/a)");
  });

  it("maps reader.open with mode through the adapter", () => {
    const ui = adaptBackendEvent({
      type: "reader.open",
      step: 3,
      payload: {
        url: "https://example.com/a",
        mode: "reader",
        title: "T",
        cityId: CITY,
        markdown: "# T",
      },
    });
    expect(ui?.type).toBe("reader.open");
    if (ui?.type === "reader.open") {
      expect(ui.mode).toBe("reader");
      expect(ui.markdown).toBe("# T");
      expect(ui.cityId).toBe(CITY);
    }
  });

  it("wires the emitted event all the way to reader UI state", () => {
    const ui = adaptBackendEvent({
      type: "reader.open",
      step: 3,
      payload: { id: "s9", url: "https://example.com/a", mode: "video", title: "V", embedUrl: "https://x/y", cityId: CITY },
    });
    expect(ui?.type).toBe("reader.open");
    // The store case delegates here: if nothing listened, the panel would
    // never open (regression test for the old browser.open black hole).
    applyReaderOpened(ui as any);
    const view = useConversationStore.getState().readerView;
    expect(view?.mode).toBe("video");
    expect(view?.embedUrl).toBe("https://x/y");
    useConversationStore.getState().closeReader();
    expect(useConversationStore.getState().readerView).toBeNull();
  });

  it("opening changes UI state; closing returns to the feed", () => {
    useConversationStore.getState().openReader({
      mode: "reader",
      title: "T",
      url: "https://example.com/a",
      cityId: CITY,
      markdown: "# T",
    });
    const open = useConversationStore.getState().readerView;
    expect(open?.mode).toBe("reader");
    expect(open?.markdown).toBe("# T");
    useConversationStore.getState().closeReader();
    expect(useConversationStore.getState().readerView).toBeNull();
  });

  it("opening a source with the agent surface closed surfaces the reader (closed-chat no-op regression)", () => {
    // Feed clicks land here while the user browses the city with the chat
    // closed (the default). AgentConversation returns null when closed, so
    // setting readerView alone renders nothing: the click dies silently.
    useConversationStore.setState({ layoutState: "closed", readerView: null });
    useConversationStore.getState().openReader({
      sourceId: "s1",
      mode: "reader",
      title: "T",
      url: "https://example.com/a",
      cityId: CITY,
      markdown: "# T",
    });
    expect(useConversationStore.getState().readerView?.mode).toBe("reader");
    // The reader panel only mounts when the agent surface is open.
    expect(useConversationStore.getState().layoutState).not.toBe("closed");
    useConversationStore.getState().closeReader();
  });

  it("backfills thumbnails for saved videos missing an image", () => {
    const now = new Date().toISOString();
    const seed = (id: string, kind: string, url: string, image: string | null) => {
      db.query(
        "INSERT INTO sources (id, city_id, kind, url, title, image, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).run(id, CITY, kind, url, "T", image, now);
    };
    seed("v_youtube", "video", "https://www.youtube.com/watch?v=dQw4w9WgXcQ", null);
    seed("v_vimeo", "video", "https://vimeo.com/76979871", null);
    seed("v_kept", "video", "https://youtu.be/9bZkp7q19f0", "https://cdn.example.com/kept.jpg");
    seed("a_plain", "article", "https://example.com/a", null);
    seed("v_broken", "video", "https://example.com/not-a-video", null);
    const { filledCount } = backfillVideoThumbnails();
    expect(filledCount).toBe(2);
    const get = (id: string) =>
      (db.query("SELECT image FROM sources WHERE id = ?").get(id) as any)?.image ?? null;
    expect(get("v_youtube")).toBe("https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
    expect(get("v_vimeo")).toBe("https://vumbnail.com/76979871.jpg");
    expect(get("v_kept")).toBe("https://cdn.example.com/kept.jpg");
    expect(get("a_plain")).toBeNull();
    expect(get("v_broken")).toBeNull();
  });

  it("sources.open returns the mode per type through the agent surface", async () => {
    const mk = (kind: string, url: string, fullText: string | null) => {
      const id = `t_${Math.random().toString(36).slice(2, 8)}`;
      db.query(
        "INSERT INTO sources (id, city_id, kind, url, title, created_at) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(id, CITY, kind, url, "T", new Date().toISOString());
      if (fullText) db.query("UPDATE sources SET full_text = ? WHERE id = ?").run(fullText, id);
      return id;
    };
    const vid = mk("video", "https://www.youtube.com/watch?v=dQw4w9WgXcQ", null);
    const art = mk("article", "https://example.com/with-text", "# Saved\n\ntext");
    const bare = mk("article", "https://example.com/no-text", null);

    const ctx = { step: 1, cityId: CITY } as any;
    const v: any = await invoke_capability.execute({ id: "sources.open", input: { id: vid, cityId: CITY } }, ctx);
    expect(v.data?.data?.mode).toBe("video");
    expect(v.data?.data?.embedUrl || "").toContain("youtube.com/embed/");

    const a: any = await invoke_capability.execute({ id: "sources.open", input: { id: art, cityId: CITY } }, ctx);
    expect(a.data?.data?.mode).toBe("reader");

    const e: any = await invoke_capability.execute({ id: "sources.open", input: { id: bare, cityId: CITY } }, ctx);
    expect(e.data?.data?.mode).toBe("external");
    expect(typeof e.data?.data?.reason).toBe("string");
  });
});
