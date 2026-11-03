import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Window } from "happy-dom";

const fileWindow = new Window({ url: "http://localhost:3000/" });
// Suite-shared browser globals (voice-test pattern): set once, never
// deleted — other files mount on their own windows; deletion races
// happy-dom's pending event machinery (ReferenceError: window undefined).
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as any).window = fileWindow;
(globalThis as any).document = fileWindow.document;
(globalThis as any).navigator = fileWindow.navigator;
(globalThis as any).HTMLElement = fileWindow.HTMLElement;
(globalThis as any).SVGElement = fileWindow.SVGElement;
(globalThis as any).Node = fileWindow.Node;
(globalThis as any).DocumentFragment = fileWindow.DocumentFragment;
(globalThis as any).Event = fileWindow.Event;

/**
 * Live chat regression pin (#387): the exact symptom was steps/responses
 * arriving only after reload. The pipe is: ensureTaskStream (EventSource
 * listeners) -> handleJobSseEvent funnel -> store. This drives that pipe
 * with recorded heavy-turn frames through a scripted EventSource — no
 * server, no model, deterministic.
 *
 * Frames mirror a real heavy turn (search + sources.add): agent.start,
 * tool.start, tool.done, source.added, message.done, all under one
 * message-scoped jobId with monotonic ids.
 */
type Listener = (ev: any) => void;

const FRAMES: Array<{ type: string; id: number; data: any }> = [
  {
    type: "agent.start",
    id: 1,
    data: { jobId: "msg_probe_1", prompt: "Search the web and save sources.", sessionId: "sess_probe" },
  },
  {
    type: "tool.start",
    id: 2,
    data: { jobId: "msg_probe_1", id: "call_1", name: "invoke_capability", arguments: { id: "search.web" } },
  },
  {
    type: "tool.done",
    id: 3,
    data: { jobId: "msg_probe_1", id: "call_1", name: "invoke_capability", result: { success: true } },
  },
  {
    type: "source.added",
    id: 4,
    data: { jobId: "msg_probe_1", id: "src_1", capability: "sources.add", url: "https://example.com/a", title: "A" },
  },
  {
    type: "message.done",
    id: 5,
    data: { jobId: "msg_probe_1", text: "Saved 1 article as a source." },
  },
];

class FakeEventSource {
  static OPEN = 1;
  static CLOSED = 2;
  url: string;
  readyState = 1;
  listeners = new Map<string, Listener[]>();
  onmessage: Listener | null = null;
  onerror: Listener | null = null;
  static lastInstance: FakeEventSource | null = null;
  constructor(url: string) {
    this.url = url;
    FakeEventSource.lastInstance = this;
    // Replay async, like a real stream handshake.
    setTimeout(() => this.replay(), 0);
  }
  addEventListener(type: string, fn: Listener) {
    const list = this.listeners.get(type) || [];
    list.push(fn);
    this.listeners.set(type, list);
  }
  replay() {
    for (const f of FRAMES) {
      const ev = { type: f.type, data: JSON.stringify(f.data), lastEventId: String(f.id) };
      for (const fn of this.listeners.get(f.type) || []) fn(ev);
    }
  }
  close() {
    this.readyState = 2;
  }
}

const REAL_ES = (globalThis as any).EventSource;

describe("live task stream (#387)", () => {
  beforeEach(async () => {
    (globalThis as any).EventSource = FakeEventSource as any;
    FakeEventSource.lastInstance = null;
    const { useConversationStore } = await import("../src/lib/agent/conversationStore");
    useConversationStore.setState({ messages: [], taskCards: {}, messageSteps: {} } as any);
  });

  afterEach(async () => {
    (globalThis as any).EventSource = REAL_ES;
    const { useConversationStore } = await import("../src/lib/agent/conversationStore");
    useConversationStore.setState({ messages: [], taskCards: {}, messageSteps: {} } as any);
  });

  it("renders steps as tool events arrive (no reload)", async () => {
    const { useConversationStore } = await import("../src/lib/agent/conversationStore");
    useConversationStore.getState().ensureTaskStream("sess_steps");
    await new Promise((r) => setTimeout(r, 50));
    const state = useConversationStore.getState();
    const steps = state.messageSteps["m-msg_probe_1"] || [];
    expect(steps.length).toBeGreaterThan(0);
    // invoke_capability is save-kind via stepKindForTool? invoke_capability
    // is not in the map -> default think; still recorded as a step.
    expect(steps.some((s) => s.status === "done")).toBe(true);
  });

  it("appends the completion message and never duplicates on replay", async () => {
    const { useConversationStore } = await import("../src/lib/agent/conversationStore");
    // sendViaOrchestrator always appends this placeholder right after POST.
    useConversationStore.setState((state) => ({
      messages: [
        ...state.messages,
        { id: "m-msg_probe_1", role: "assistant", content: "", streaming: true, timestamp: Date.now() },
      ],
    }));
    useConversationStore.getState().ensureTaskStream("sess_dupe");
    await new Promise((r) => setTimeout(r, 50));
    const filled = useConversationStore.getState().messages.find((m: any) => m.id === "m-msg_probe_1") as any;
    expect(filled?.content).toContain("Saved 1 article");
    expect(filled?.streaming).toBe(false);
    const first = useConversationStore.getState().messages.length;
    // Second subscription replays the same frames: idempotent, no dupes.
    FakeEventSource.lastInstance?.replay();
    await new Promise((r) => setTimeout(r, 50));
    const second = useConversationStore.getState().messages.length;
    expect(second).toBe(first);
  });

  it("subscribes with the session cursor for resume", async () => {
    const { useConversationStore } = await import("../src/lib/agent/conversationStore");
    useConversationStore.getState().ensureTaskStream("sess_cursor");
    await new Promise((r) => setTimeout(r, 20));
    expect(FakeEventSource.lastInstance?.url ?? "").toContain("sessionId=sess_cursor");
  });
});
