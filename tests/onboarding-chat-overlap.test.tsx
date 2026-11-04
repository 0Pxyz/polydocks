import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { Window } from "happy-dom";
import { act } from "react";
import React from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Same harness contract as chat-scroll-focus.test.tsx: motion is
// decorative, DOM content is what matters.
mock.module("motion/react", () => {
  const Plain = ({ children, ...props }: any) => {
    const {
      animate: _animate,
      transition: _transition,
      variants: _variants,
      initial: _initial,
      exit: _exit,
      whileHover: _whileHover,
      whileTap: _whileTap,
      layout: _layout,
      layoutId: _layoutId,
      ...rest
    } = props;
    return React.createElement("div", rest, children);
  };
  const motionProxy = new Proxy(
    {},
    {
      get: () => Plain,
    }
  );
  const AnimatePresence = ({ children }: any) => React.createElement(React.Fragment, null, children);
  return { motion: motionProxy, AnimatePresence };
});

const fileWindow = new Window({ url: "http://localhost:3000/" });
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as any).window = fileWindow;
(globalThis as any).document = fileWindow.document;
(globalThis as any).navigator = fileWindow.navigator;
(globalThis as any).HTMLElement = fileWindow.HTMLElement;
(globalThis as any).Element = fileWindow.Element;
(globalThis as any).Node = fileWindow.Node;
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

const realFetch = globalThis.fetch;
const realRO = (globalThis as any).ResizeObserver;

beforeEach(async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  (globalThis as any).fetch = async () => ({ ok: true, json: async () => ({}) });
  const { useConversationStore } = await import("../src/lib/agent/conversationStore");
  useConversationStore.setState({
    messages: [],
    taskCards: {},
    messageSteps: {},
    messageThinking: {},
    isStreaming: false,
    statusText: "",
    draft: "",
    layoutState: "closed",
    lastEventAt: 0,
  } as any);
  fileWindow.document.documentElement.style.removeProperty("--chat-sheet-height");
});

afterEach(async () => {
  (globalThis as any).fetch = realFetch;
  if (realRO === undefined) delete (globalThis as any).ResizeObserver;
  else (globalThis as any).ResizeObserver = realRO;
  const { useConversationStore } = await import("../src/lib/agent/conversationStore");
  useConversationStore.setState({ messages: [], layoutState: "closed", draft: "" } as any);
});

/**
 * Overlap regression: the onboarding pill used a fixed bottom offset while
 * the floating chat sheet grows with the text, so the pill covered the
 * composer. Contract: the sheet publishes its measured height as
 * --chat-sheet-height, and the pill stacks above it.
 */
describe("onboarding pill never covers the chat composer", () => {
  it("sheet publishes its height; pill consumes it for its bottom offset", () => {
    const convo = readFileSync(resolve(__dirname, "../src/features/agent/AgentConversation.tsx"), "utf8");
    expect(convo).toContain("sheetPanelRef");
    expect(convo).toContain("new ResizeObserver");
    expect(convo).toContain("--chat-sheet-height");
    const engine = readFileSync(resolve(__dirname, "../src/features/onboarding/LiveOnboarding.tsx"), "utf8");
    expect(engine).toContain("--chat-sheet-height");
    expect(engine).toContain("pillAboveChat");
    // Explicit stacking: tour controls above the chat surface.
    expect(engine).toContain("z-50");
    expect(convo).toContain("z-40");
  });

  it("growing sheet updates the var; unmount clears it", async () => {
    const seen: Array<{ cb: (...args: any[]) => void; el: any }> = [];
    (globalThis as any).ResizeObserver = class {
      cb: (...args: any[]) => void;
      el: any = null;
      constructor(cb: (...args: any[]) => void) {
        this.cb = cb;
        seen.push(this as any);
      }
      observe(el: any) {
        this.el = el;
      }
      unobserve() {}
      disconnect() {}
    };
    const { AgentConversation } = await import("../src/features/agent/AgentConversation");
    const { useConversationStore } = await import("../src/lib/agent/conversationStore");
    const { createRoot } = await import("react-dom/client");
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
      await act(async () => {
        useConversationStore.setState({ layoutState: "sheet" } as any);
      });
      await act(async () => {
        root.render(React.createElement(AgentConversation, {}));
      });
      expect(seen.length).toBeGreaterThan(0);
      const target = seen[0].el;
      expect(target).not.toBeNull();
      // Chat grows to 5 lines: the observer republishes the new height.
      Object.defineProperty(target, "offsetHeight", { value: 212, configurable: true });
      await act(async () => {
        seen[0].cb();
      });
      expect(document.documentElement.style.getPropertyValue("--chat-sheet-height")).toBe("212px");
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
    expect(document.documentElement.style.getPropertyValue("--chat-sheet-height")).toBe("");
  });

  it("closing the sheet clears the var", async () => {
    (globalThis as any).ResizeObserver = class {
      constructor(_cb: (...args: any[]) => void) {}
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    const { AgentConversation } = await import("../src/features/agent/AgentConversation");
    const { useConversationStore } = await import("../src/lib/agent/conversationStore");
    const { createRoot } = await import("react-dom/client");
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
      await act(async () => {
        useConversationStore.setState({ layoutState: "sheet" } as any);
      });
      await act(async () => {
        root.render(React.createElement(AgentConversation, {}));
      });
      await act(async () => {
        useConversationStore.setState({ layoutState: "closed" } as any);
      });
      expect(document.documentElement.style.getPropertyValue("--chat-sheet-height")).toBe("");
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });
});

/**
 * Pill shows title + counter + controls only: the truncated description
 * is gone, chips sit directly below the title row.
 */
describe("onboarding pill shows title only, no truncated subtitle", () => {
  const engine = readFileSync(resolve(__dirname, "../src/features/onboarding/LiveOnboarding.tsx"), "utf8");

  it("does not render stepDef.subtitle", () => {
    expect(engine).not.toContain("stepDef.subtitle");
  });

  it("title wraps up to two lines instead of truncating", () => {
    expect(engine).toContain("line-clamp-2");
    expect(engine).not.toContain("truncate");
  });
});
describe("research step shows live TinyFish search branding", () => {
  const engine = readFileSync(resolve(__dirname, "../src/features/onboarding/LiveOnboarding.tsx"), "utf8");

  it("uses the official logo asset, three placements", () => {
    expect(engine).toContain("TINYFISH_LOGO_SRC");
    const hits = engine.match(/TINYFISH_LOGO_SRC/g) ?? [];
    // Import + title logo + chip seal.
    expect(hits.length).toBeGreaterThanOrEqual(3);
  });

  it("auto-advance holds while a script runs, rescheduling instead of killing it", () => {
    const engine = readFileSync(resolve(__dirname, "../src/features/onboarding/LiveOnboarding.tsx"), "utf8");
    expect(engine).toContain("isDemoBusy()");
    expect(engine).toContain("1500");
  });

  it("staggers the find chips and gates motion on pause + reduced motion", () => {
    expect(engine).toContain("animationDelay");
    expect(engine).toContain("300");
    expect(engine).toContain("isReduced");
    expect(engine).toContain("searching");
    expect(engine).toContain("!paused");
  });
});
