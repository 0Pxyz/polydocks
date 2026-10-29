import { describe, it, expect } from "bun:test";
import {
  youtubeId,
  vimeoId,
  youtubeEmbedUrl,
  vimeoEmbedUrl,
  thumbnailForUrl,
} from "./ids";

describe("video ids: one definition, all five YouTube formats", () => {
  const ID = "dQw4w9WgXcQ";
  const cases: Array<[string, string]> = [
    [`https://www.youtube.com/watch?v=${ID}`, "watch?v="],
    [`https://youtube.com/watch?v=${ID}&list=PLx&index=2`, "watch?v= with list"],
    [`https://youtu.be/${ID}`, "youtu.be/"],
    [`https://youtu.be/${ID}?t=30`, "youtu.be/ with timestamp"],
    [`https://www.youtube.com/shorts/${ID}`, "shorts/"],
    [`https://www.youtube.com/embed/${ID}`, "embed/"],
    [`https://www.youtube.com/live/${ID}`, "live/"],
    [`https://m.youtube.com/watch?v=${ID}`, "mobile host"],
    [`https://music.youtube.com/watch?v=${ID}`, "music host"],
  ];
  for (const [url, label] of cases) {
    it(`extracts id from ${label}`, () => {
      expect(youtubeId(url)).toBe(ID);
    });
  }

  it("rejects playlists, channels, and malformed ids", () => {
    expect(youtubeId("https://www.youtube.com/playlist?list=PLabc123XYZ")).toBeNull();
    expect(youtubeId("https://www.youtube.com/@somechannel")).toBeNull();
    expect(youtubeId("https://www.youtube.com/watch?v=short")).toBeNull();
    expect(youtubeId("https://www.youtube.com/watch")).toBeNull();
    expect(youtubeId("not a url")).toBeNull();
    expect(youtubeId("https://vimeo.com/123456789")).toBeNull();
  });

  it("builds the canonical youtube.com embed (never -nocookie)", () => {
    expect(youtubeEmbedUrl(`https://youtu.be/${ID}`)).toBe(
      `https://www.youtube.com/embed/${ID}?rel=0&modestbranding=1&playsinline=1`
    );
    expect(youtubeEmbedUrl("https://example.com/a")).toBeNull();
  });

  it("extracts vimeo ids and player urls", () => {
    expect(vimeoId("https://vimeo.com/76979871")).toBe("76979871");
    expect(vimeoId("https://vimeo.com/channels/staffpicks/76979871")).toBeNull();
    expect(vimeoEmbedUrl("https://vimeo.com/76979871")).toBe("https://player.vimeo.com/video/76979871");
  });

  it("derives thumbnails from urls without a saved image", () => {
    expect(thumbnailForUrl(`https://www.youtube.com/watch?v=${ID}`)).toBe(
      `https://i.ytimg.com/vi/${ID}/hqdefault.jpg`
    );
    expect(thumbnailForUrl("https://vimeo.com/76979871")).toBe("https://vumbnail.com/76979871.jpg");
    expect(thumbnailForUrl("https://example.com/article")).toBeNull();
  });
});
