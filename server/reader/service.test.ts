import { describe, expect, it } from "bun:test";
import { classifyReaderUrl, htmlToMarkdown, loadReaderContent } from "./service";

describe("Native Reader backend", () => {
  it("classifies YouTube watch/shorts/embed URLs as video", () => {
    expect(classifyReaderUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ").kind).toBe("video");
    expect(classifyReaderUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ").embedUrl).toContain(
      "youtube-nocookie.com"
    );
    expect(classifyReaderUrl("https://youtu.be/dQw4w9WgXcQ").kind).toBe("video");
    expect(classifyReaderUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ").kind).toBe("video");
  });

  it("classifies Vimeo and direct video files as video", () => {
    const vimeo = classifyReaderUrl("https://vimeo.com/123456789");
    expect(vimeo.kind).toBe("video");
    expect(vimeo.embedUrl).toContain("player.vimeo.com");
    expect(classifyReaderUrl("https://example.com/clip.mp4").kind).toBe("video");
  });

  it("classifies articles as article", () => {
    expect(classifyReaderUrl("https://example.com/blog/post").kind).toBe("article");
    expect(classifyReaderUrl("not a url").kind).toBe("article");
  });

  it("extracts markdown from HTML without scripts", () => {
    const { title, markdown } = htmlToMarkdown(
      `<html><head><title>Test Post</title><script>alert(1)</script></head><body><h1>Hello</h1><p>World <a href="https://example.com">link</a></p></body></html>`
    );
    expect(title).toBe("Test Post");
    expect(markdown).toContain("# Hello");
    expect(markdown).toContain("[link](https://example.com)");
    expect(markdown).not.toContain("alert(1)");
  });

  it("blocks SSRF targets without network access", async () => {
    await expect(loadReaderContent("http://localhost:3000/x")).rejects.toThrow();
    await expect(loadReaderContent("http://127.0.0.1/x")).rejects.toThrow();
    await expect(loadReaderContent("http://169.254.169.254/")).rejects.toThrow();
  });
});
