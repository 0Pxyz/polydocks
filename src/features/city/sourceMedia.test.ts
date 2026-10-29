import { describe, it, expect } from "bun:test";
import {
  youtubeIdFromUrl,
  vimeoIdFromUrl,
  videoThumbnailCandidates,
  faviconUrl,
  territoryAccent,
} from "./sourceMedia";

const ID = "dQw4w9WgXcQ";

describe("source media (front mirror of server/video/ids)", () => {
  it("extracts youtube ids in all five formats", () => {
    expect(youtubeIdFromUrl(`https://www.youtube.com/watch?v=${ID}`)).toBe(ID);
    expect(youtubeIdFromUrl(`https://youtu.be/${ID}?t=30`)).toBe(ID);
    expect(youtubeIdFromUrl(`https://www.youtube.com/shorts/${ID}`)).toBe(ID);
    expect(youtubeIdFromUrl(`https://www.youtube.com/embed/${ID}`)).toBe(ID);
    expect(youtubeIdFromUrl(`https://www.youtube.com/live/${ID}`)).toBe(ID);
    expect(youtubeIdFromUrl("https://www.youtube.com/playlist?list=PLabc123XYZ")).toBeNull();
  });

  it("derives thumbnails even when no image was saved", () => {
    expect(videoThumbnailCandidates(`https://www.youtube.com/watch?v=${ID}`, null)).toEqual([
      `https://i.ytimg.com/vi/${ID}/maxresdefault.jpg`,
      `https://i.ytimg.com/vi/${ID}/hqdefault.jpg`,
    ]);
    expect(videoThumbnailCandidates("https://vimeo.com/76979871", "")).toEqual([
      "https://vumbnail.com/76979871.jpg",
    ]);
    expect(videoThumbnailCandidates("https://example.com/article", null)).toEqual([]);
  });

  it("keeps a saved image untouched", () => {
    expect(videoThumbnailCandidates(`https://www.youtube.com/watch?v=${ID}`, "https://cdn/x.jpg")).toEqual([
      "https://cdn/x.jpg",
    ]);
  });

  it("builds favicon urls and deterministic territory accents", () => {
    expect(faviconUrl("youtube.com")).toContain("domain=youtube.com");
    expect(faviconUrl("")).toBeNull();
    expect(territoryAccent("TikTok")).toBe(territoryAccent("TikTok"));
    expect(territoryAccent("TikTok")).toMatch(/^hsl\(\d+ 55% 38%\)$/);
    expect(territoryAccent("TikTok")).not.toBe(territoryAccent("Stoicism"));
  });

  it("extracts vimeo ids", () => {
    expect(vimeoIdFromUrl("https://vimeo.com/76979871")).toBe("76979871");
    expect(vimeoIdFromUrl("https://example.com/x")).toBeNull();
  });
});
