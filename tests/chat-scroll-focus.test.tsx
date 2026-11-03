import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { Window } from "happy-dom";
import { act } from "react";
import React from "react";

// Same harness contract as orchestrator-composer.test.tsx: motion is
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

const realFetch = globalThis.fetch;

async function renderConversation() {
  const { AgentConversation } = await import("../src/features/agent/AgentConversation");
  const { useConversationStore } = await import("../src/lib/agent/conversationStore");
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(AgentConversation, {}));
  });
  return { container, store: useConversationStore };
}

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
(globalThis as any).KeyboardEvent = fileWindow.KeyboardEvent;
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
});

afterEach(async () => {
  (globalThis as any).fetch = realFetch;
  const { useConversationStore } = await import("../src/lib/agent/conversationStore");
  useConversationStore.setState({ messages: [], layoutState: "closed", isStreaming: false } as any);
});

function transcriptOf(container: Element): Element {
  const el = container.querySelector(".overflow-y-auto");
  if (!el) throw new Error("transcript viewport not found");
  return el;
}

function mockGeometry(el: Element, opts: { scrollHeight: number; clientHeight: number; scrollTop: number }) {
  Object.defineProperty(el, "scrollHeight", { value: opts.scrollHeight, configurable: true });
  Object.defineProperty(el, "clientHeight", { value: opts.clientHeight, configurable: true });
  (el as any).scrollTop = opts.scrollTop;
  const calls: any[] = [];
  (el as any).scrollTo = (arg: any) => {
    calls.push(arg);
    (el as any).scrollTop = typeof arg === "object" ? arg.top : 0;
  };
  return calls;
}

/**
 * Chat transcript behavior (#173 slice 1): focus lands on the composer on
 * open; streaming never yanks a reader who scrolled up.
 */
describe("chat transcript scroll + focus (#173)", () => {
  it("focuses the composer textarea when the panel opens", async () => {
    const { container, store } = await renderConversation();
    expect(container.querySelector("textarea")).toBeNull();
    await act(async () => {
      store.setState({ layoutState: "side" } as any);
    });
    const box = container.querySelector("textarea");
    expect(box).not.toBeNull();
    expect(document.activeElement).toBe(box as any);
  });

  it("does not yank a scrolled-up reader down while streaming", async () => {
    const { container, store } = await renderConversation();
    await act(async () => {
      store.setState({
        layoutState: "side",
        isStreaming: true,
        messages: [{ id: "m-1", role: "assistant", content: "first", timestamp: Date.now() }],
      } as any);
    });
    const el = transcriptOf(container);
    // Reader scrolled up: 500px away from the bottom.
    const calls = mockGeometry(el, { scrollHeight: 2000, clientHeight: 500, scrollTop: 1000 });
    await act(async () => {
      el.dispatchEvent(new (globalThis as any).Event("scroll", { bubbles: true }));
    });
    // A streamed chunk lands while the reader is away.
    await act(async () => {
      store.setState({
        messages: [
          { id: "m-1", role: "assistant", content: "first", timestamp: Date.now() },
          { id: "m-2", role: "assistant", content: "second", streaming: true, timestamp: Date.now() },
        ],
      } as any);
    });
    expect(calls.length).toBe(0);
    expect((el as any).scrollTop).toBe(1000);
  });

  it("stays pinned while streaming when already at the bottom", async () => {
    const { container, store } = await renderConversation();
    await act(async () => {
      store.setState({
        layoutState: "side",
        isStreaming: true,
        messages: [{ id: "m-1", role: "assistant", content: "first", timestamp: Date.now() }],
      } as any);
    });
    const el = transcriptOf(container);
    const calls = mockGeometry(el, { scrollHeight: 2000, clientHeight: 500, scrollTop: 1500 });
    await act(async () => {
      store.setState({
        messages: [
          { id: "m-1", role: "assistant", content: "first", timestamp: Date.now() },
          { id: "m-2", role: "assistant", content: "second", streaming: true, timestamp: Date.now() },
        ],
      } as any);
    });
    expect(calls.length).toBeGreaterThan(0);
  });
});
