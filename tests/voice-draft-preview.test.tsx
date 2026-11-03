import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { Window } from "happy-dom";
import { act } from "react";
import React from "react";

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

const realFetch = globalThis.fetch;

const fileWindow = new Window({ url: "http://localhost:3000/" });
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as any).window = fileWindow;
(globalThis as any).document = fileWindow.document;
(globalThis as any).navigator = fileWindow.navigator;
(globalThis as any).HTMLElement = fileWindow.HTMLElement;
(globalThis as any).HTMLTextAreaElement = fileWindow.HTMLTextAreaElement;
(globalThis as any).HTMLButtonElement = fileWindow.HTMLButtonElement;
(globalThis as any).HTMLDivElement = fileWindow.HTMLDivElement;
(globalThis as any).Element = fileWindow.Element;
(globalThis as any).SVGElement = fileWindow.SVGElement;
(globalThis as any).Node = fileWindow.Node;
(globalThis as any).DocumentFragment = fileWindow.DocumentFragment;
(globalThis as any).Event = fileWindow.Event;
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
 * Voice-to-chat handoff at the UI level (#177): partial transcripts land
 * in the composer draft (visible words while speaking) and the send
 * button enables — the exact "nothing appears" complaint.
 */
describe("voice draft preview (#177)", () => {
  beforeEach(async () => {
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
    useConversationStore.setState({ messages: [], layoutState: "closed", isStreaming: false, draft: "" } as any);
  });

  it("partial transcripts render in the composer and enable send", async () => {
    const { AgentConversation } = await import("../src/features/agent/AgentConversation");
    const { useConversationStore } = await import("../src/lib/agent/conversationStore");
    const { createRoot } = await import("react-dom/client");
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
      await act(async () => {
        root.render(React.createElement(AgentConversation, {}));
      });
      // Voice partial path: onPartial -> setDraft (panel must be open).
      await act(async () => {
        useConversationStore.getState().setDraft("hello world");
        useConversationStore.setState({ layoutState: "side" } as any);
      });
      const areas = Array.from(container.querySelectorAll("textarea"));
      expect(areas.length).toBeGreaterThan(0);
      expect(areas.some((a) => (a as HTMLTextAreaElement).value === "hello world")).toBe(true);
      const send = Array.from(container.querySelectorAll("button")).find(
        (b) => b.getAttribute("title") === "Send message"
      ) as HTMLButtonElement;
      expect(send).toBeDefined();
      expect(send.disabled).toBe(false);
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });
});
