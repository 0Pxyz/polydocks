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
  useConversationStore.setState({ messages: [], taskCards: {}, isStreaming: false, statusText: "" } as any);
});

describe("Orchestrator front: input never blocks on running jobs", () => {
  it("sends while a job runs and streams the reply by message id", async () => {
    mockSessionId = "sess-1";
    await useConversationStore.getState().sendMessage("create a dashboard tool");
    expect(posted.length).toBe(1);
    expect(posted[0].url).toBe("/api/agent/message");
    // Input free immediately: no global streaming flag held.
    expect(useConversationStore.getState().isStreaming).toBe(false);
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
