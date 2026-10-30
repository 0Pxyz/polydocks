import { describe, it, expect } from "bun:test";
import { VIDEO_IFRAME_ATTRS, youtubeEmbedSrc, youtubeWatchUrl } from "./embedConfig";

describe("video iframe contract (Error 153 fix)", () => {
  it("uses a real referrer (never no-referrer)", () => {
    expect(VIDEO_IFRAME_ATTRS.referrerPolicy).toBe("strict-origin-when-cross-origin");
  });

  it("sandboxes with presentation + popups and autoplay media permissions", () => {
    expect(VIDEO_IFRAME_ATTRS.sandbox).toBe(
      "allow-scripts allow-same-origin allow-presentation allow-popups"
    );
    expect(VIDEO_IFRAME_ATTRS.allow).toBe("autoplay; encrypted-media; picture-in-picture; fullscreen");
  });

  it("builds youtube.com embeds (never -nocookie) with player params", () => {
    const src = youtubeEmbedSrc("dQw4w9WgXcQ", "http://localhost:5173");
    expect(src.startsWith("https://www.youtube.com/embed/dQw4w9WgXcQ?")).toBe(true);
    expect(src).not.toContain("nocookie");
    expect(src).toContain("rel=0");
    expect(src).toContain("modestbranding=1");
    expect(src).toContain("playsinline=1");
    expect(src).toContain("enablejsapi=1");
    expect(youtubeWatchUrl("dQw4w9WgXcQ")).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  });
});
