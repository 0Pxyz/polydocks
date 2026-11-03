import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Window } from "happy-dom";
import { act } from "react";
import React from "react";

const realFetch = globalThis.fetch;
const realConsoleError = console.error;

const fileWindow = new Window({ url: "http://localhost:3000/" });
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as any).window = fileWindow;
(globalThis as any).document = fileWindow.document;
(globalThis as any).navigator = fileWindow.navigator;
(globalThis as any).HTMLElement = fileWindow.HTMLElement;
(globalThis as any).Element = fileWindow.Element;
(globalThis as any).SVGElement = fileWindow.SVGElement;
(globalThis as any).Node = fileWindow.Node;
(globalThis as any).DocumentFragment = fileWindow.DocumentFragment;
(globalThis as any).Event = fileWindow.Event;
(globalThis as any).getComputedStyle = fileWindow.getComputedStyle.bind(fileWindow);
(globalThis as any).requestAnimationFrame = (fn: FrameRequestCallback) => setTimeout(() => fn(Date.now()), 16);
(fileWindow as any).matchMedia = () => ({
  matches: false,
  addListener() {},
  removeListener() {},
  addEventListener() {},
  removeEventListener() {},
});

/**
 * Frame-blocked fallback card (#350): when the reader cannot extract a
 * site (X-Frame-Options / CSP hosts like GitHub), the surface shows an
 * honest styled card with an "Open in new tab" action — never a blank
 * void or silent white screen. Zero unhandled console errors.
 */
describe("browser fallback card (#350)", () => {
  let consoleErrors: string[] = [];

  beforeEach(() => {
    consoleErrors = [];
    console.error = (...args: any[]) => {
      consoleErrors.push(args.map(String).join(" "));
    };
    // Reader fetch fails: the blocked-site path.
    (globalThis as any).fetch = async () => ({
      ok: true,
      json: async () => ({ success: false, error: "reader_blocked_host" }),
    });
  });

  afterEach(() => {
    (globalThis as any).fetch = realFetch;
    console.error = realConsoleError;
  });

  async function renderReader(url: string) {
    const { ReaderView } = await import("../src/features/dock/ReaderView");
    const { createRoot } = await import("react-dom/client");
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    let opened: string | null = null;
    await act(async () => {
      root.render(
        React.createElement(ReaderView, {
          url,
          onOpenExternal: (u: string) => {
            opened = u;
          },
        })
      );
    });
    // Let the mocked fetch promise + state update flush.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    return { container, root, opened: () => opened };
  }

  it("shows the styled fallback with Open in new tab on blocked sites", async () => {
    const { container, root } = await renderReader("https://github.com/example/repo");
    try {
      const text = container.textContent || "";
      expect(text).toContain("github.com");
      expect(text).toContain("can't be shown here");
      const btn = Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Open in new tab"
      );
      expect(btn).toBeDefined();
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });

  it("the Open in new tab action fires with the blocked URL", async () => {
    const { container, root, opened } = await renderReader("https://github.com/example/repo");
    try {
      const btn = Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Open in new tab"
      )!;
      await act(async () => {
        btn.dispatchEvent(new (fileWindow as any).MouseEvent("click", { bubbles: true }));
      });
      expect(opened()).toBe("https://github.com/example/repo");
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });

  it("emits no unhandled console errors on the blocked path", async () => {
    const { container, root } = await renderReader("https://google.com/search?q=x");
    try {
      const fatal = consoleErrors.filter(
        (m) => !m.includes("act(") && !m.includes("ReactDOMTestUtils")
      );
      expect(fatal).toEqual([]);
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });
});
