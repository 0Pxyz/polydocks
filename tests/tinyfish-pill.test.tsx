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
(globalThis as any).DocumentFragment = fileWindow.DocumentFragment;
(globalThis as any).KeyboardEvent = fileWindow.KeyboardEvent;
(globalThis as any).Event = fileWindow.Event;
(globalThis as any).getComputedStyle = fileWindow.getComputedStyle.bind(fileWindow);
(globalThis as any).requestAnimationFrame = (fn: FrameRequestCallback) => setTimeout(() => fn(Date.now()), 16);
(fileWindow as any).matchMedia = () => ({
  matches: false,
  addListener() {},
  removeEventListener() {},
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
  const { useConversationStore } = await import("../src/lib/agent/conversationStore");
  useConversationStore.setState({ activity: [], layoutState: "closed" } as any);
});

/**
 * TinyFish brand pill contract (#323): branded tools show the logo while
 * running and dissolve on completion; capability ids count as branded;
 * errors show the error mark, never a healthy-looking logo.
 */
describe("tinyfish brand pill (#323)", () => {
  it("recognizes agent tools, capability ids and label fallbacks", async () => {
    const { isBrandedActivity } = await import("../src/lib/agent/events");
    expect(isBrandedActivity("search_web", "Searching")).toBe(true);
    expect(isBrandedActivity("fetch_page", "Reading")).toBe(true);
    expect(isBrandedActivity("search.web", "search")).toBe(true);
    expect(isBrandedActivity("search.fetch", "fetch")).toBe(true);
    expect(isBrandedActivity("capability", "Searching the web via TinyFish")).toBe(true);
    expect(isBrandedActivity("dock_search", "Searching dock")).toBe(false);
    expect(isBrandedActivity(undefined, "Working")).toBe(false);
  });

  it("dissolves branded rows on completion and keeps plain ones as done", async () => {
    const { dissolveCompletedActivity } = await import("../src/lib/agent/conversationStore");
    const rows = [
      { id: "a", label: 'Searching the web via TinyFish for "x"', state: "running", startedAt: 1, tool: "search_web" },
      { id: "b", label: "Running dock_search", state: "running", startedAt: 1, tool: "dock_search" },
    ] as any;
    const afterA = dissolveCompletedActivity(rows, "a");
    expect(afterA.map((r) => r.id)).toEqual(["b"]);
    expect(afterA[0].state).toBe("running");
    const afterB = dissolveCompletedActivity(afterA, "b");
    expect(afterB.map((r) => r.id)).toEqual(["b"]);
    expect(afterB[0].state).toBe("done");
  });

  it("renders the logo pill while running with query context", async () => {
    const { AgentConversation } = await import("../src/features/agent/AgentConversation");
    const { useConversationStore } = await import("../src/lib/agent/conversationStore");
    const { createRoot } = await import("react-dom/client");
    useConversationStore.setState({
      layoutState: "full",
      isStreaming: true,
      statusText: "",
      activity: [
        {
          id: "t1",
          label: 'Searching the web via TinyFish for "agentic coding"',
          state: "running",
          startedAt: Date.now(),
          tool: "search_web",
        },
      ],
    } as any);
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(AgentConversation, {}));
      // Let mount effects (timers, mocked fetches) settle inside act.
      await new Promise((r) => setTimeout(r, 50));
    });
    const img = container.querySelector('img[alt="TinyFish"]');
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toContain("tinyfish-logo");
    expect(img?.className).toContain("w-4");
    expect(container.textContent).toContain("agentic coding");
    await act(async () => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  it("renders the error mark, not the logo, on branded failures", async () => {
    const { AgentConversation } = await import("../src/features/agent/AgentConversation");
    const { useConversationStore } = await import("../src/lib/agent/conversationStore");
    const { createRoot } = await import("react-dom/client");
    useConversationStore.setState({
      layoutState: "full",
      isStreaming: true,
      statusText: "",
      activity: [
        {
          id: "t1",
          label: "Searching the web via TinyFish",
          state: "error",
          startedAt: Date.now(),
          tool: "search_web",
        },
      ],
    } as any);
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(AgentConversation, {}));
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(container.querySelector('img[alt="TinyFish"]')).toBeNull();
    expect(container.textContent).toContain("Searching the web via TinyFish");
    await act(async () => {
      root.unmount();
    });
    document.body.removeChild(container);
  });
});
