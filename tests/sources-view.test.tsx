import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Window } from "happy-dom";
import { act } from "react";
import React from "react";
import { faviconUrlFor } from "../src/features/sources/SourcesView";

const realFetch = globalThis.fetch;
const realConsoleError = console.error;

const fileWindow = new Window({ url: "http://localhost:3000/" });
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as any).window = fileWindow;
(globalThis as any).document = fileWindow.document;
(globalThis as any).navigator = fileWindow.navigator;
(globalThis as any).HTMLElement = fileWindow.HTMLElement;
(globalThis as any).HTMLImageElement = fileWindow.HTMLImageElement;
(globalThis as any).HTMLButtonElement = fileWindow.HTMLButtonElement;
(globalThis as any).HTMLDivElement = fileWindow.HTMLDivElement;
(globalThis as any).Element = fileWindow.Element;
(globalThis as any).SVGElement = fileWindow.SVGElement;
(globalThis as any).Node = fileWindow.Node;
(globalThis as any).DocumentFragment = fileWindow.DocumentFragment;
(globalThis as any).Event = fileWindow.Event;
(globalThis as any).CustomEvent = fileWindow.CustomEvent;
(globalThis as any).getComputedStyle = fileWindow.getComputedStyle.bind(fileWindow);
(globalThis as any).requestAnimationFrame = (fn: FrameRequestCallback) => setTimeout(() => fn(Date.now(), 16));
(fileWindow as any).matchMedia = () => ({
  matches: false,
  addListener() {},
  removeListener() {},
  addEventListener() {},
  removeEventListener() {},
});

/**
 * Sources feed contract (#352): cards with title + site logo, live prepend
 * on save events, click hands off to the Browser, broken logos degrade to
 * a letter tile. Zero unhandled console errors.
 */
describe("sources feed (#352)", () => {
  let consoleErrors: string[] = [];

  const seed = [
    { id: "src_1", url: "https://en.wikipedia.org/wiki/Raft", title: "Raft — Wikipedia", site: "en.wikipedia.org", kind: "article", image: null },
    { id: "src_2", url: "https://arxiv.org/abs/1234", title: "In Search of an Understandable Consensus", site: "arxiv.org", kind: "paper", image: null },
  ];

  beforeEach(() => {
    consoleErrors = [];
    console.error = (...args: any[]) => {
      consoleErrors.push(args.map(String).join(" "));
    };
    (globalThis as any).fetch = async () => ({
      ok: true,
      json: async () => ({ ok: true, data: { items: seed } }),
    });
  });

  afterEach(() => {
    (globalThis as any).fetch = realFetch;
    console.error = realConsoleError;
  });

  it("derives favicon URLs per site", () => {
    expect(faviconUrlFor("arxiv.org")).toBe("https://www.google.com/s2/favicons?domain=arxiv.org&sz=64");
  });

  async function renderFeed() {
    const { SourcesView } = await import("../src/features/sources/SourcesView");
    const { createRoot } = await import("react-dom/client");
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const opened: string[] = [];
    await act(async () => {
      root.render(React.createElement(SourcesView, { onOpenUrl: (u: string) => opened.push(u) }));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    return { container, root, opened };
  }

  it("renders cards with title, site and logo", async () => {
    const { container, root } = await renderFeed();
    try {
      const text = container.textContent || "";
      expect(text).toContain("Raft — Wikipedia");
      expect(text).toContain("arxiv.org");
      const imgs = Array.from(container.querySelectorAll("img"));
      expect(imgs.length).toBeGreaterThan(0);
      expect(imgs[0].getAttribute("src") || "").toContain("favicons?domain=");
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });

  it("clicking a card hands the URL to the Browser", async () => {
    const { container, root, opened } = await renderFeed();
    try {
      const card = Array.from(container.querySelectorAll("button")).find((b) =>
        (b.textContent || "").includes("Raft — Wikipedia")
      )!;
      expect(card).toBeDefined();
      await act(async () => {
        card.dispatchEvent(new (fileWindow as any).MouseEvent("click", { bubbles: true }));
      });
      expect(opened).toEqual(["https://en.wikipedia.org/wiki/Raft"]);
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });

  it("live save events prepend cards without refresh", async () => {
    const { container, root } = await renderFeed();
    try {
      expect(container.textContent || "").not.toContain("MDN Web Docs");
      await act(async () => {
        window.dispatchEvent(
          new CustomEvent("polymax:source.added", {
            detail: { id: "src_3", url: "https://developer.mozilla.org/x", title: "MDN Web Docs", site: "developer.mozilla.org", kind: "article" },
          })
        );
      });
      const text = container.textContent || "";
      expect(text).toContain("MDN Web Docs");
      // Newest first.
      expect(text.indexOf("MDN Web Docs")).toBeLessThan(text.indexOf("Raft — Wikipedia"));
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });

  it("broken logos degrade to a letter tile", async () => {
    const { container, root } = await renderFeed();
    try {
      expect(container.querySelectorAll("img").length).toBe(2);
      const img = container.querySelector("img") as any;
      expect(img).toBeDefined();
      await act(async () => {
        img.dispatchEvent(new (fileWindow as any).Event("error"));
      });
      // Only the broken logo degrades; the other card keeps its image.
      expect(container.querySelectorAll("img").length).toBe(1);
      const text = container.textContent || "";
      expect(text).toContain("E");
      expect(text).toContain("Raft — Wikipedia");
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });

  it("emits no unhandled console errors", async () => {
    const { container, root } = await renderFeed();
    try {
      const fatal = consoleErrors.filter((m) => !m.includes("act("));
      expect(fatal).toEqual([]);
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });
});
