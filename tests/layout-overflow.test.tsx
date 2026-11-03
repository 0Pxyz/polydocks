import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { Window } from "happy-dom";
import { act } from "react";
import React from "react";

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
(globalThis as any).SVGElement = fileWindow.SVGElement;
(globalThis as any).Node = fileWindow.Node;
(globalThis as any).HTMLFormElement = (fileWindow as any).HTMLFormElement;
(globalThis as any).HTMLInputElement = (fileWindow as any).HTMLInputElement;
(globalThis as any).HTMLButtonElement = (fileWindow as any).HTMLButtonElement;
(globalThis as any).HTMLDivElement = (fileWindow as any).HTMLDivElement;
(globalThis as any).DocumentFragment = fileWindow.DocumentFragment;
(globalThis as any).KeyboardEvent = fileWindow.KeyboardEvent;
(globalThis as any).Event = fileWindow.Event;
(globalThis as any).getComputedStyle = fileWindow.getComputedStyle.bind(fileWindow);
(globalThis as any).ResizeObserver = (fileWindow as any).ResizeObserver;
(globalThis as any).requestAnimationFrame = (fn: FrameRequestCallback) => setTimeout(() => fn(Date.now()), 16);
(fileWindow as any).matchMedia = () => ({
  matches: false,
  addListener() {},
  removeListener() {},
  addEventListener() {},
  removeEventListener() {},
});

const realFetch = globalThis.fetch;
beforeEach(async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  (globalThis as any).fetch = async () => ({ ok: true, json: async () => ({}) });
});
afterEach(async () => {
  (globalThis as any).fetch = realFetch;
});

function classList(el: Element): string[] {
  return String((el as any).className || "").split(/\s+/);
}

function isSolidWhiteBox(el: Element): boolean {
  const cls = classList(el);
  if (!cls.includes("bg-white")) return false;
  // Translucent white overlays (bg-white/5, dots, hairlines) are the
  // dark-theme idiom. So are tiny round control knobs (Radix Switch
  // thumb: solid white knob on an accent track) — neither is the
  // full-bleed white container box the regression is about.
  if (cls.includes("rounded-full") && (cls.includes("size-4") || cls.includes("size-3.5"))) return false;
  return true;
}

function hasNoWhiteBg(root: Element): boolean {
  // No stark solid-white container backgrounds anywhere in the view.
  const els = root.querySelectorAll("*");
  for (const el of Array.from(els)) {
    if (isSolidWhiteBox(el)) return false;
  }
  return true;
}

function verticalScrollers(root: Element): Element[] {
  // Elements whose own classes make them vertical scroll containers.
  return Array.from(root.querySelectorAll("*")).filter((el) => {
    const cls = classList(el);
    return cls.includes("overflow-y-auto") || cls.includes("overflow-y-scroll");
  });
}

/**
 * Layout regression contract (#306): one vertical scroller per view, no
 * white boxes, long unbroken strings wrap instead of blowing out.
 * happy-dom has no box layout, so this pins the structural contract that
 * makes those guarantees hold (wrap classes, min-w-0 flex chains,
 * horizontal clip on the transcript).
 */
describe("layout overflow contract (#306)", () => {
  it("chat transcript clips horizontal overflow and wraps long tokens", async () => {
    const { AgentConversation } = await import("../src/features/agent/AgentConversation");
    const { useConversationStore } = await import("../src/lib/agent/conversationStore");
    const { createRoot } = await import("react-dom/client");
    const longToken = "a".repeat(200);
    useConversationStore.setState({
      layoutState: "side",
      isStreaming: false,
      statusText: "",
      messages: [
        { id: "u1", role: "user", content: `hash ${longToken}`, timestamp: Date.now() },
        { id: "a1", role: "assistant", content: `id ${longToken}`, timestamp: Date.now() },
      ],
    } as any);
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(AgentConversation, {}));
      await new Promise((r) => setTimeout(r, 50));
    });

    const scrollers = verticalScrollers(container);
    expect(scrollers.length).toBe(1);
    expect(classList(scrollers[0])).toContain("overflow-x-hidden");

    const userBubble = container.querySelector('[data-msg-role="user"] > div');
    expect(userBubble).not.toBeNull();
    expect(classList(userBubble!).some((c) => c === "break-words" || c === "break-all")).toBe(true);

    const assistant = container.querySelector('[data-msg-role="assistant"]');
    expect(assistant).not.toBeNull();
    expect(classList(assistant!).includes("min-w-0")).toBe(true);

    await act(async () => {
      root.unmount();
    });
    document.body.removeChild(container);
    useConversationStore.setState({ messages: [], layoutState: "closed" } as any);
  });

  it("settings renders one scroll container with no white boxes", async () => {
    const { SettingsView } = await import("../src/features/settings/SettingsView");
    const { createRoot } = await import("react-dom/client");
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(SettingsView, {}));
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(verticalScrollers(container).length).toBe(1);
    expect(hasNoWhiteBg(container)).toBe(true);

    await act(async () => {
      root.unmount();
    });
    document.body.removeChild(container);
  });
});
