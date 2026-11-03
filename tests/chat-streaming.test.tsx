import { describe, expect, it } from "bun:test";
import { renderToString } from "react-dom/server";
import { AssistantMarkdown, StreamingText } from "../src/features/agent/StreamingText";

describe("StreamingText progressive reveal", () => {
  it("renders markdown: bold, links, fenced code with language + copy", () => {
    const html = renderToString(
      <StreamingText
        text={'Some **bold** and [docs](https://example.com)\n\n```ts\nconst a = 1;\n```'}
        streaming={false}
      />
    );
    expect(html).toContain("<strong>");
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain("const a = 1;");
    // Code block header keeps language label and copy control.
    expect(html).toContain(">ts<");
    expect(html).toContain("Copy");
  });

  it("shows a live caret while streaming, none when done", () => {
    const live = renderToString(<StreamingText text="hello" streaming />);
    expect(live).toContain('aria-live="polite"');
    expect(live).toContain("animate-pulse");
    const done = renderToString(<StreamingText text="hello" streaming={false} />);
    expect(done).toContain('aria-live="polite"');
    expect(done).not.toContain("animate-pulse");
  });

  it("renders head and tail blocks without dropping content", () => {
    const html = renderToString(<StreamingText text={"First para.\n\nSecond para."} streaming />);
    expect(html).toContain("First para.");
    expect(html).toContain("Second para.");
  });

  it("assistant markdown preserves inline code and links", () => {
    const html = renderToString(<AssistantMarkdown content={"Run `bun test` — see [guide](https://example.com/x)."} />);
    expect(html).toContain("<code");
    expect(html).toContain("bun test");
    expect(html).toContain('href="https://example.com/x"');
  });
});
