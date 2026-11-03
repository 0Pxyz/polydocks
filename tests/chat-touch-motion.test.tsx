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
(globalThis as any).Node = fileWindow.Node;
(globalThis as any).requestAnimationFrame = (fn: FrameRequestCallback) => setTimeout(() => fn(Date.now()), 16);

type Listener = () => void;
let listeners: Listener[] = [];
let matches = false;
(fileWindow as any).matchMedia = () => ({
  get matches() {
    return matches;
  },
  addEventListener(_type: string, fn: Listener) {
    listeners.push(fn);
  },
  removeEventListener(_type: string, fn: Listener) {
    listeners = listeners.filter((l) => l !== fn);
  },
  addListener() {},
  removeListener() {},
});

/**
 * Touch + motion slice of #173: reactive reduced-motion, coarse tips,
 * and guards that keep the fixes from regressing.
 */
describe("touch + motion (#173 slice 2)", () => {
  beforeEach(() => {
    listeners = [];
    matches = false;
  });

  it("useReducedMotion re-renders when the OS setting changes", async () => {
    const { useReducedMotion } = await import("../src/lib/motion");
    const seen: boolean[] = [];
    function Probe() {
      seen.push(useReducedMotion());
      return null;
    }
    const { createRoot } = await import("react-dom/client");
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(Probe));
    });
    expect(seen).toEqual([false]);
    await act(async () => {
      matches = true;
      for (const fn of [...listeners]) fn();
    });
    expect(seen[seen.length - 1]).toBe(true);
    await act(async () => {
      root.unmount();
    });
    expect(listeners.length).toBe(0);
    document.body.removeChild(container);
  });

  it("rotatingTips hides keyboard tips on coarse pointers", async () => {
    const { rotatingTips } = await import("../src/features/home/HomeScreen");
    const all = rotatingTips(false);
    expect(all.some((t) => /ctrl/i.test(t))).toBe(true);
    const coarse = rotatingTips(true);
    expect(coarse.length).toBeGreaterThan(0);
    expect(coarse.some((t) => /ctrl/i.test(t))).toBe(false);
  });

  it("message actions stay reachable without hover", async () => {
    const src = await Bun.file("src/features/agent/AgentConversation.tsx").text();
    expect(src.includes("focus-within:opacity-100")).toBe(true);
    expect(src.includes("[@media(hover:none)]:opacity-100")).toBe(true);
  });

  it("coarse-pointer panel rules exist in one place", async () => {
    const css = await Bun.file("src/index.css").text();
    expect(css.includes(".agent-panel button")).toBe(true);
    expect(css.includes("min-width: 44px")).toBe(true);
    expect(css.includes(".agent-panel input")).toBe(true);
  });
});
