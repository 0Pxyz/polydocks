import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { Window } from "happy-dom";
import { act } from "react";
import React from "react";

// Motion animations (infinite Orb loops, AnimatePresence exits) run on the
// mocked rAF loop and cancel mid-flight when trees update, surfacing as
// unhandled AbortErrors that fail unrelated tests. The timeline assertions
// only need DOM content, so render plain divs/fragments here.
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

type SSEHandler = (ev: { data: string; lastEventId: string; type: string }) => void;
const sseInstances: Array<{
  url: string;
  listeners: Map<string, SSEHandler[]>;
  emit: (type: string, data: unknown, id: number) => void;
  close: () => void;
}> = [];

class FakeEventSource {
  url: string;
  listeners = new Map<string, SSEHandler[]>();
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;
  readyState = 1;
  onmessage: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  constructor(url: string) {
    this.url = url;
    sseInstances.push({
      url,
      listeners: this.listeners,
      emit: (type: string, data: unknown, id: number) => {
        this.emit(type, data, id);
      },
      close: () => {
        this.readyState = 2;
      },
    });
  }
  emit(type: string, data: unknown, id: number) {
    const msg = { data: JSON.stringify(data), lastEventId: String(id), type };
    for (const fn of this.listeners.get(type) ?? []) fn(msg);
  }
  addEventListener(type: string, fn: SSEHandler) {
    const list = this.listeners.get(type) ?? [];
    list.push(fn);
    this.listeners.set(type, list);
  }
  close() {
    this.readyState = 2;
  }
}

let posted: Array<{ url: string; body: any }> = [];
let seq = 0;

async function renderConversation() {
  const { AgentConversation } = await import("../src/features/agent/AgentConversation");
  const { useConversationStore } = await import("../src/lib/agent/conversationStore");
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  // NOTE: roots are never unmounted mid-file. Unmounting a tree with
  // motion exit animations poisons subsequent mounts in happy-dom
  // (empty commits on every later render). One container per test keeps
  // queries scoped; the process exits at file end anyway.
  await act(async () => {
    root.render(React.createElement(AgentConversation, {}));
  });
  return { container, store: useConversationStore };
}

// One happy-dom Window for the whole file: motion caches animation globals,
// so swapping (or deleting) window/document between tests poisons renders.
// Reset body + stores per test instead of rebuilding the DOM.
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
// Still frames in tests: Orb runs infinite JS animations otherwise, and
// clearing body between tests cancels them mid-flight, surfacing as
// unhandled AbortErrors that fail the suite. Reduced motion keeps the same
// DOM/labels with duration-0 transitions.
(fileWindow as any).matchMedia = (query: string) => ({
  matches: typeof query === "string" && query.includes("prefers-reduced-motion"),
  addListener() {},
  removeListener() {},
  addEventListener() {},
  removeEventListener() {},
});
(globalThis as any).EventSource = FakeEventSource;

beforeEach(async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  // Do not clear body: previous trees stay mounted (no unmount, no DOM
  // removal) so their motion animations never cancel mid-flight. Each test
  // renders a fresh container and queries only within it; shared store state
  // is reset below for isolation.
  posted = [];
  seq = 0;
  sseInstances.length = 0;
  (globalThis as any).fetch = async (url: any, init: any) => {
    const body = JSON.parse(init.body);
    posted.push({ url: String(url), body });
    seq += 1;
    return {
      ok: true,
      json: async () => ({ success: true, messageId: `msg-${seq}`, sessionId: `sess-ui` }),
    };
  };
  const { useConversationStore } = await import("../src/lib/agent/conversationStore");
  useConversationStore.setState({ messages: [], taskCards: {}, messageSteps: {}, messageThinking: {}, isStreaming: false, statusText: "", draft: "", layoutState: "side" } as any);
});

afterEach(async () => {
  (globalThis as any).fetch = realFetch;
  const { useConversationStore } = await import("../src/lib/agent/conversationStore");
  useConversationStore.setState({ messages: [], taskCards: {}, messageSteps: {}, messageThinking: {}, isStreaming: false, statusText: "", layoutState: "closed" } as any);
});

describe("Composer stays usable while a reply streams (real UI)", () => {
  it("Enter sends while thinking, second message appears instantly, order preserved", async () => {
    const { container, store } = await renderConversation();
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    expect(textarea).toBeTruthy();

    // First message via real Enter keydown.
    expect(typeof window).toBe("object");
    expect(typeof document).toBe("object");
    await act(async () => {
      store.getState().setDraft("build me a dashboard tool");
    });
    await act(async () => {
      textarea.dispatchEvent(new (globalThis as any).KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    });
    expect(posted.length).toBe(1);

    // While the first reply streams, the composer is NOT locked:
    // textarea enabled (the draft cleared after send, so refill first).
    expect(textarea.disabled).toBe(false);
    await act(async () => {
      store.getState().setDraft("e agora?");
    });
    const sendButtons = [...container.querySelectorAll("button[title='Send message']")];
    expect(sendButtons.length).toBe(1);
    expect((sendButtons[0] as HTMLButtonElement).disabled).toBe(false);

    // Stream a partial reply, then send the second message mid-stream.
    // Capture through the direct return value (same session reuses the
    // live instance) — never through the shared sseInstances array.
    const stream = store.getState().ensureTaskStream("sess-ui") as unknown as FakeEventSource;
    expect(stream).toBeTruthy();
    await act(async () => {
      stream.emit("message.delta", { text: "On it", jobId: "msg-1" }, 1);
    });
    await act(async () => {
      textarea.dispatchEvent(new (globalThis as any).KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    });
    expect(posted.length).toBe(2);

    // Finish both in order; each lands on its own message, no duplication.
    await act(async () => {
      stream.emit("message.done", { text: "On it — building.", jobId: "msg-1" }, 2);
      stream.emit("message.delta", { text: "Tudo certo.", jobId: "msg-2" }, 3);
      stream.emit("message.done", { text: "Tudo certo.", jobId: "msg-2" }, 4);
      stream.emit("message.done", { text: "On it — building.", jobId: "msg-1" }, 2);
    });
    const texts = [...container.querySelectorAll("*")]
      .map((el) => el.textContent || "")
      .join("\n");
    expect(texts).toContain("On it — building.");
    expect(texts).toContain("Tudo certo.");
    const state = store.getState();
    expect(state.messages.filter((m) => m.id === "m-msg-1").length).toBe(1);
    expect(state.messages.filter((m) => m.id === "m-msg-2").length).toBe(1);
    expect(state.messages.filter((m) => m.role === "user").map((m) => m.content)).toEqual([
      "build me a dashboard tool",
      "e agora?",
    ]);
  });
});

describe("Thinking timeline from the durable stream (real UI)", () => {
  let streamSeq = 0;
  async function renderWithStream() {
    const rendered = await renderConversation();
    const session = `sess-steps-${(streamSeq += 1)}`;
    // Capture the stream through the direct return value: the shared
    // sseInstances array can be cleared by another test's beforeEach while
    // this test still runs, so array indexes are never a stream identity.
    let stream: FakeEventSource | null = null;
    await act(async () => {
      stream = rendered.store.getState().ensureTaskStream(session) as unknown as FakeEventSource;
    });
    expect(stream).toBeTruthy();
    return { ...rendered, stream: stream as unknown as FakeEventSource };
  }

  it("tool.start renders a friendly step, tool.done completes it", async () => {
    const { container, store, stream } = await renderWithStream();
    await act(async () => {
      stream.emit("message.delta", { jobId: "msg-t1", text: "" }, 1);
      stream.emit("tool.start", { jobId: "msg-t1", name: "search_web", arguments: { query: "ocean robots" }, id: "tool-1" }, 2);
    });
    const timeline = container.querySelector('[data-testid="steps-timeline"]');
    expect(timeline).toBeTruthy();
    expect(timeline).toBeTruthy();
    expect(timeline?.textContent || "").toContain("Searching the web via TinyFish");
    await act(async () => {
      stream.emit("tool.done", { jobId: "msg-t1", name: "search_web", id: "tool-1", result: { success: true } }, 2);
    });
    const done = container.querySelector('[data-testid="steps-timeline"] [data-step-status="done"]');
    expect(done).toBeTruthy();
    expect(store.getState().messageSteps["m-msg-t1"]?.[0]?.status).toBe("done");
  });

  it("never renders technical tool ids in the chat DOM", async () => {
    const { container, stream } = await renderWithStream();
    await act(async () => {
      stream.emit("message.delta", { jobId: "msg-t2", text: "" }, 1);
      stream.emit("tool.start", { jobId: "msg-t2", name: "search_web", arguments: { query: "reefs" }, id: "tool-9" }, 2);
      stream.emit("tool.start", { jobId: "msg-t2", name: "fetch_page", arguments: { url: "https://example.com/a" }, id: "tool-10" }, 3);
      stream.emit("message.delta", { jobId: "msg-t2", text: "draft answer" }, 4);
    });
    const text = container.textContent || "";
    for (const tech of ["search_web", "fetch_page", "dock_search", "invoke_capability", "read_skill", "tool.start", "tool-9"]) {
      expect(text.includes(tech)).toBe(false);
    }
    expect(text).toContain("Searching the web via TinyFish");
    expect(text).toContain("Reading primary sources via TinyFish");
  });

  it("replay of the same tool.start does not duplicate steps", async () => {
    const { store, stream } = await renderWithStream();
    await act(async () => {
      stream.emit("tool.start", { jobId: "msg-t3", name: "search_web", arguments: { query: "kelp" }, id: "tool-5" }, 1);
      stream.emit("tool.start", { jobId: "msg-t3", name: "search_web", arguments: { query: "kelp" }, id: "tool-5" }, 1);
    });
    expect(store.getState().messageSteps["m-msg-t3"]?.length).toBe(1);
  });

  it("pre-tool narration lands in the collapsible thinking block, not chat text", async () => {
    const { container, store, stream } = await renderWithStream();
    await act(async () => {
      stream.emit("message.delta", { jobId: "msg-t4", text: "Let me think about this", thinking: true }, 1);
      stream.emit("message.delta", { jobId: "msg-t4", text: "real answer" }, 2);
    });
    expect(store.getState().messageThinking["m-msg-t4"]).toContain("Let me think");
    const msg = store.getState().messages.find((m) => m.id === "m-msg-t4");
    expect(msg?.content).toBe("real answer");
    expect(container.querySelector('[data-testid="steps-timeline"]')?.textContent || "").toContain("Show thinking");
  });

  it("job card expands to show steps and completion announces the real summary", async () => {
    const { container, store, stream } = await renderWithStream();
    await act(async () => {
      stream.emit("job.queued", { jobId: "job-steps-1", prompt: "research reefs" }, 1);
      stream.emit("tool.start", { jobId: "job-steps-1", name: "fetch_page", arguments: { url: "https://example.com/b" }, id: "tool-7" }, 2);
    });
    const expandBtn = container.querySelector('[aria-label="Background jobs"] button[aria-expanded]') as HTMLButtonElement;
    expect(expandBtn).toBeTruthy();
    await act(async () => {
      expandBtn.dispatchEvent(new (globalThis as any).Event("click", { bubbles: true }));
    });
    expect(container.textContent || "").toContain("Reading primary sources via TinyFish");
    await act(async () => {
      stream.emit("job.completed", { jobId: "job-steps-1", status: "completed", summary: "Feed created with 12 items." }, 3);
    });
    const texts = [...container.querySelectorAll("*")].map((el) => el.textContent || "").join("\n");
    expect(texts).toContain("Feed created with 12 items.");
    expect(texts.includes("research reefs")).toBe(false);
    expect(store.getState().messageSteps["m-job-steps-1"]?.length).toBeGreaterThan(0);
  });
});
