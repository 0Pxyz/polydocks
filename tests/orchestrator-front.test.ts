import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { useConversationStore } from "../src/lib/agent/conversationStore";

const realFetch = (globalThis as any).fetch;
let calls: Array<{ url: string; body: any }> = [];

function mockOrchestrator() {
  calls = [];
  (globalThis as any).fetch = async (url: any, init: any) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return {
      json: async () => ({
        success: true,
        type: "ack",
        taskId: `task_${calls.length}`,
        text: "On it — building in the background.",
        decision: { kind: "create_tool", confidence: 0.9, reason: "test" },
        sessionId: "sess_test_1",
        messageId: `m${calls.length}`,
      }),
    };
  };
}

beforeEach(() => {
  mockOrchestrator();
  useConversationStore.setState({ messages: [], taskCards: {}, isStreaming: false, statusText: "" });
});

afterEach(() => {
  (globalThis as any).fetch = realFetch;
  useConversationStore.setState({ messages: [], taskCards: {}, isStreaming: false, statusText: "" });
});

describe("Orchestrator front: input never blocks on running jobs", () => {
  it("sends while a job runs and keeps streaming brief", async () => {
    const store = useConversationStore.getState();
    await store.sendMessage("create a dashboard tool");

    expect(calls.length).toBe(1);
    expect(calls[0].url).toBe("/api/agent/message");
    // Ack received: input enabled again even though the job still runs.
    expect(useConversationStore.getState().isStreaming).toBe(false);
    expect(useConversationStore.getState().taskCards["task_1"]?.status).toBe("queued");

    // Second message goes through immediately (no "still working" gate).
    await useConversationStore.getState().sendMessage("como está?");
    expect(calls.length).toBe(2);
    expect(calls[1].body.prompt).toBe("como está?");
    expect(useConversationStore.getState().statusText).not.toContain("Still working");
  });

  it("applies dock actions from the orchestrator reply", async () => {
    (globalThis as any).fetch = async () => ({
      json: async () => ({
        success: true,
        type: "dock_action",
        op: "open",
        id: "browser",
        text: 'Opening "browser".',
        decision: { kind: "dock_action", confidence: 0.9, reason: "test" },
        sessionId: "sess_test_2",
        messageId: "m1",
      }),
    });
    const { useDockStore } = await import("../src/lib/store/useDockStore");
    await useConversationStore.getState().sendMessage("abre o browser");
    expect(useDockStore.getState().dock.focusedId).toBe("browser");
    const last = useConversationStore.getState().messages.at(-1);
    expect(last?.content).toContain("browser");
  });
});
