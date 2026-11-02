import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { useConversationStore } from "../src/lib/agent/conversationStore";
import { useThemeStore } from "../src/lib/theme";

const realFetch = globalThis.fetch;

function mockFetchOnce(handler: (url: string, init: any) => Response | Promise<Response>) {
  (globalThis as any).fetch = async (url: string, init: any) => handler(url, init);
}

function sseStream(frames: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const frame of frames) controller.enqueue(encoder.encode(frame));
      controller.close();
    },
  });
  return new Response(stream as any, { status: 200 });
}

function sseEvent(type: string, payload: Record<string, unknown>, step = 1): string {
  return `event: ${type}\ndata: ${JSON.stringify({ step, payload })}\n\n`;
}

function resetStore() {
  useConversationStore.setState({
    messages: [],
    stagedAttachments: [],
    draft: "",
    isStreaming: false,
    isBuildingTool: false,
    statusText: "",
    activeModel: null,
    activeIntent: null,
    activeApproval: null,
    orbState: "idle",
  });
}

beforeEach(() => {
  resetStore();
});

afterEach(() => {
  globalThis.fetch = realFetch;
  resetStore();
});

describe("Busy send is never silently dropped", () => {
  it("queues through the orchestrator instead of blocking on a running turn", async () => {
    useConversationStore.setState({ isStreaming: true });
    let fetched = false;
    mockFetchOnce(async () => {
      fetched = true;
      return Response.json({
        success: true,
        type: "reply",
        text: "On it.",
        decision: { kind: "answer_quick", confidence: 0.5, reason: "test" },
        sessionId: "sess_busy",
        messageId: "m1",
      });
    });

    await useConversationStore.getState().sendMessage("Add this background to my theme");
    expect(fetched).toBe(true);
    expect(useConversationStore.getState().statusText).not.toContain("Still working");
    expect(useConversationStore.getState().messages.length).toBe(2);
  });
});

function legacyText(prompt: string) {
  // Text-only turns go through the orchestrator; the legacy SSE consumer
  // below is reached with a staged (non-image) attachment.
  useConversationStore.setState({
    draft: prompt,
    stagedAttachments: [
      { id: "att-leg", name: "note.txt", type: "text/plain", size: 3, isImage: false } as any,
    ],
  });
  return useConversationStore.getState().sendMessage(undefined);
}

describe("Dead streams reach an explicit terminal state", () => {
  it("ends in error with a cleared progress label when the stream dies silently", async () => {
    mockFetchOnce(async () => sseStream([]));
    await legacyText("hello?");
    const state = useConversationStore.getState();
    expect(state.isStreaming).toBe(false);
    expect(state.statusText).toContain("Stream ended unexpectedly");
    expect(state.messages.length).toBe(1);
    expect(state.messages[0].error?.code).toBe("stream_ended");
  });

  it("records the executing model and intent, then clears them on finish", async () => {
    mockFetchOnce(async () =>
      sseStream([
        sseEvent("agent.start", { prompt: "hi", model: "muse-spark-1.3", intent: "general" }, 0),
        sseEvent("agent.finish", { text: "Hey there.", steps: 1, model: "muse-spark-1.3", intent: "general" }),
      ])
    );
    await legacyText("hi");
    const state = useConversationStore.getState();
    expect(state.isStreaming).toBe(false);
    expect(state.activeModel).toBeNull();
    expect(state.activeIntent).toBeNull();
    const assistant = state.messages.find((m) => m.role === "assistant");
    expect(assistant?.model).toBe("muse-spark-1.3");
    expect(state.statusText).toBe("");
  });
});

describe("theme.apply is verified against the live store", () => {
  it("applies the wallpaper and reports verification", async () => {
    useThemeStore.getState().clearWallpaper();
    mockFetchOnce(async () =>
      sseStream([
        sseEvent("agent.start", { prompt: "theme me", model: "muse-spark-1.3", intent: "theme" }, 0),
        sseEvent("tool.start", { id: "t1", name: "apply_theme", arguments: { attachmentId: "att-1" } }),
        sseEvent("tool.done", { id: "t1", name: "apply_theme", result: { success: true, attachmentId: "att-1", applied: {} } }),
        sseEvent("theme.apply", { applied: {}, attachmentId: "att-1" }, 1),
        sseEvent("agent.finish", { text: "Theme updated.", steps: 1, model: "muse-spark-1.3", intent: "theme" }),
      ])
    );

    const store = useConversationStore.getState();
    store.setDraft("Add this background to my theme");
    useConversationStore.setState({
      stagedAttachments: [
        {
          id: "att-1",
          name: "bg.jpg",
          type: "image/jpeg",
          size: 100,
          dataUrl: "data:image/jpeg;base64,AAA",
          isImage: true,
        },
      ],
    });
    await useConversationStore.getState().sendMessage(undefined);

    expect(useThemeStore.getState().wallpaperUrl).toBe("data:image/jpeg;base64,AAA");
    // The finish event clears transient progress; the applied wallpaper in
    // the live store plus the agent's reply is the durable confirmation.
    expect(useConversationStore.getState().statusText).toBe("");
    const assistant = useConversationStore.getState().messages.find((m) => m.role === "assistant");
    expect(assistant?.content).toBe("Theme updated.");
  });

  it("reports honestly when the attachment cannot be resolved", async () => {
    mockFetchOnce(async () =>
      sseStream([
        sseEvent("agent.start", { prompt: "theme me", model: "muse-spark-1.3", intent: "theme" }, 0),
        sseEvent("theme.apply", { applied: {}, attachmentId: "missing-att" }, 1),
        sseEvent("agent.finish", { text: "Hmm.", steps: 1, model: "muse-spark-1.3", intent: "theme" }),
      ])
    );
    useConversationStore.setState({
      draft: "use that image as wallpaper",
      stagedAttachments: [
        { id: "att-other", name: "other.jpg", type: "image/jpeg", size: 100, dataUrl: "data:image/jpeg;base64,AAA", isImage: true } as any,
      ],
    });
    await useConversationStore.getState().sendMessage(undefined);
    const state = useConversationStore.getState();
    expect(state.messages[state.messages.length - 2]?.error?.message).toContain("partially");
  });
});
