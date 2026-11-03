import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { useConversationStore } from "../src/lib/agent/conversationStore";
import { useDockStore } from "../src/lib/store/useDockStore";

const realFetch = globalThis.fetch;
const realEventSource = (globalThis as any).EventSource;

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
  constructor(url: string) {
    this.url = url;
    const inst = {
      url,
      listeners: this.listeners,
      emit: (type: string, data: unknown, id: number) => {
        const msg = { data: JSON.stringify(data), lastEventId: String(id), type };
        for (const fn of this.listeners.get(type) ?? []) fn(msg);
      },
      close: () => {
        this.readyState = 2;
      },
    };
    sseInstances.push(inst);
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
let mockSessionId = "sess-1";
let mockMessageSeq = 0;

beforeEach(() => {
  posted = [];
  sseInstances.length = 0;
  mockMessageSeq = 0;
  (globalThis as any).fetch = async (url: any, init: any) => {
    const body = JSON.parse(init.body);
    posted.push({ url: String(url), body });
    mockMessageSeq += 1;
    return {
      ok: true,
      json: async () => ({ success: true, messageId: `msg-${mockMessageSeq}`, sessionId: mockSessionId }),
    };
  };
  (globalThis as any).window = (globalThis as any).window ?? {};
  (globalThis as any).EventSource = FakeEventSource;
  // Clear any in-flight turn leaked by an earlier file in this process.
  useConversationStore.getState().abortStream();
  useConversationStore.setState({
    messages: [],
    taskCards: {},
    isStreaming: false,
    statusText: "",
    orchestratorSessionId: null,
  } as any);
});

afterEach(() => {
  (globalThis as any).fetch = realFetch;
  (globalThis as any).EventSource = realEventSource;
  useConversationStore.getState().abortStream();
  useConversationStore.setState({ messages: [], taskCards: {}, isStreaming: false, statusText: "" } as any);
});

describe("Orchestrator front: input never blocks on running jobs", () => {
  it("sends while a job runs and streams the reply by message id", async () => {
    mockSessionId = "sess-1";
    await useConversationStore.getState().sendMessage("create a dashboard tool");
    expect(posted.length).toBe(1);
    expect(posted[0].url).toBe("/api/agent/message");
    // Send returns immediately (never awaits the turn), but the busy
    // signal is on while the turn is in flight (#387) so the chat shows
    // its working indicators instead of looking dead.
    expect(useConversationStore.getState().isStreaming).toBe(true);
    const placeholder = useConversationStore.getState().messages.find((m) => m.id === "m-msg-1");
    expect(sseInstances.length).toBe(1);
    expect(placeholder?.streaming).toBe(true);

    const stream = sseInstances[0];
    expect(stream.url).toContain("/api/tasks/stream?sessionId=sess-1");
    stream.emit("message.delta", { text: "On it", jobId: "msg-1", sessionId: "sess-1" }, 11);
    stream.emit("message.delta", { text: " — building.", jobId: "msg-1" }, 12);
    expect(useConversationStore.getState().messages.find((m) => m.id === "m-msg-1")?.content).toBe(
      "On it — building."
    );
    stream.emit("message.done", { text: "On it — building.", taskId: "task-9", jobId: "msg-1", prompt: "create a dashboard tool" }, 13);
    const done = useConversationStore.getState().messages.find((m) => m.id === "m-msg-1");
    expect(done?.content).toBe("On it — building.");
    expect(done?.streaming).toBe(false);
    // Busy signal settles with the turn.
    expect(useConversationStore.getState().isStreaming).toBe(false);

    // Replay / reconnect duplicates change nothing.
    stream.emit("message.done", { text: "On it — building.", taskId: "task-9", jobId: "msg-1", prompt: "create a dashboard tool" }, 13);
    expect(useConversationStore.getState().messages.filter((m) => m.id === "m-msg-1").length).toBe(1);

    // Second message goes through while the first is done (and would too mid-stream).
    await useConversationStore.getState().sendMessage("como está?");
    expect(posted.length).toBe(2);
    expect(posted[1].body.prompt).toBe("como está?");
    expect(useConversationStore.getState().statusText).not.toContain("Still working");
  });

  it("applies dock actions from streamed events and mounts created plugins", async () => {
    mockSessionId = "sess-2";
    const seen: Array<{ id: string; title: string; icon?: string }> = [];
    const opened: string[] = [];
    await useConversationStore.getState().sendMessage("abre o browser", {
      onExperienceCreated: (exp) => seen.push(exp),
      onOpenExperience: (id) => opened.push(id),
    });
    const stream = sseInstances[0];
    stream.emit("message.done", { text: 'Opening "browser".', action: { op: "open", id: "browser" }, jobId: "msg-1" }, 21);
    expect(useDockStore.getState().dock.focusedId).toBe("browser");

    stream.emit(
      "plugin.created",
      { jobId: "task-9", pluginId: "my-tool", name: "My Tool", icon: "cards", success: true },
      22
    );
    expect(seen).toEqual([{ id: "my-tool", title: "My Tool", icon: "cards" }]);
    expect(opened).toEqual(["my-tool"]);
  });
});

describe("Orchestrator front: jobs resume after reload (#178)", () => {
  const seedFetch = (tasks: any[]) => {
    (globalThis as any).fetch = async (url: any) => {
      if (String(url).startsWith("/api/tasks?")) {
        return { ok: true, json: async () => ({ tasks }) };
      }
      throw new Error(`unexpected fetch ${url}`);
    };
  };

  it("seeds active cards from the API and reopens the stream", async () => {
    seedFetch([
      { id: "task-run-1", status: "running", type: "plugin_synthesis", input: { prompt: "build me a dashboard" } },
      { id: "task-old-1", status: "completed", type: "research", input: {} },
      { id: "task-cancel-1", status: "cancelled", type: "chat", input: {} },
    ]);
    useConversationStore.setState({ taskCards: {}, orchestratorSessionId: "sess-resume" } as any);

    await useConversationStore.getState().hydrateJobs();

    const cards = useConversationStore.getState().taskCards;
    expect(Object.keys(cards)).toEqual(["task-run-1"]);
    expect(cards["task-run-1"].title).toBe("build me a dashboard");
    expect(cards["task-run-1"].status).toBe("running");
    const stream = sseInstances.find((s) => s.url.includes("/api/tasks/stream?sessionId=sess-resume"));
    expect(stream).toBeDefined();

    // Idempotent: replay + re-hydrate never duplicate.
    stream!.emit("job.started", { jobId: "task-run-1", taskId: "task-run-1" }, 31);
    await useConversationStore.getState().hydrateJobs();
    expect(Object.keys(useConversationStore.getState().taskCards)).toEqual(["task-run-1"]);
  });

  it("rebuilds a card from stream replay when the API misses it", async () => {
    seedFetch([]);
    useConversationStore.setState({ taskCards: {}, orchestratorSessionId: "sess-replay" } as any);

    await useConversationStore.getState().hydrateJobs();
    expect(useConversationStore.getState().taskCards).toEqual({});
    const stream = sseInstances.find((s) => s.url.includes("sess-replay"));
    expect(stream).toBeDefined();
    stream!.emit("job.queued", { jobId: "task-late-1", taskId: "task-late-1", prompt: "late job" }, 41);
    expect(useConversationStore.getState().taskCards["task-late-1"]?.status).toBe("queued");
  });

  it("does nothing without a session", async () => {
    let fetched = 0;
    (globalThis as any).fetch = async () => {
      fetched += 1;
      throw new Error("must not fetch");
    };
    const before = sseInstances.length;
    useConversationStore.setState({ taskCards: {}, orchestratorSessionId: null } as any);
    await useConversationStore.getState().hydrateJobs();
    expect(fetched).toBe(0);
    expect(sseInstances.length).toBe(before);
  });
});
