import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Window } from "happy-dom";
import { act } from "react";
import React from "react";

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
    const self = this;
    sseInstances.push({
      url,
      listeners: this.listeners,
      emit(type: string, data: unknown, id: number) {
        const msg = { data: JSON.stringify(data), lastEventId: String(id), type };
        for (const fn of self.listeners.get(type) ?? []) fn(msg);
      },
      close() {
        self.readyState = 2;
      },
    });
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

const mountedRoots: Array<{ unmount: () => void }> = [];

async function renderConversation() {
  const { AgentConversation } = await import("../src/features/agent/AgentConversation");
  const { useConversationStore } = await import("../src/lib/agent/conversationStore");
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  await act(async () => {
    root.render(React.createElement(AgentConversation, {}));
  });
  return { container, root, store: useConversationStore };
}

beforeEach(async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const window = new Window({ url: "http://localhost:3000/" });
  (globalThis as any).window = window;
  (globalThis as any).document = window.document;
  (globalThis as any).navigator = window.navigator;
  (globalThis as any).HTMLElement = window.HTMLElement;
  (globalThis as any).Element = window.Element;
  (globalThis as any).SVGElement = window.SVGElement;
  (globalThis as any).Node = window.Node;
  (globalThis as any).DocumentFragment = window.DocumentFragment;
  (globalThis as any).KeyboardEvent = window.KeyboardEvent;
  (globalThis as any).Event = window.Event;
  (globalThis as any).getComputedStyle = window.getComputedStyle.bind(window);
  if (!(globalThis as any).requestAnimationFrame) {
    (globalThis as any).requestAnimationFrame = (fn: FrameRequestCallback) => setTimeout(() => fn(Date.now()), 16);
  }
  if (typeof (window as any).matchMedia !== "function") {
    (window as any).matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  }
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
  (globalThis as any).EventSource = FakeEventSource;
  const { useConversationStore } = await import("../src/lib/agent/conversationStore");
  useConversationStore.setState({ messages: [], taskCards: {}, isStreaming: false, statusText: "", draft: "", layoutState: "side" } as any);
});

afterEach(async () => {
  (globalThis as any).fetch = realFetch;
  for (const root of mountedRoots.splice(0)) {
    try {
      const { act: reactAct } = await import("react");
      await reactAct(async () => {
        root.unmount();
      });
    } catch {
      // Best effort: never fail the suite on teardown.
    }
  }
  delete (globalThis as any).window;
  delete (globalThis as any).document;
  const { useConversationStore } = await import("../src/lib/agent/conversationStore");
  useConversationStore.setState({ messages: [], taskCards: {}, isStreaming: false, statusText: "", layoutState: "closed" } as any);
});

describe("Composer stays usable while a reply streams (real UI)", () => {
  it("Enter sends while thinking, second message appears instantly, order preserved", async () => {
    const { container, root, store } = await renderConversation();
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
    const stream = sseInstances[0];
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

    await act(async () => {
      root.unmount();
    });
  });
});
