import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { useConversationStore } from "../src/lib/agent/conversationStore";

/**
 * Stable orchestrator session (#347): every message must ride the stored
 * session, or the server mints one session per message and the stream —
 * which follows only the latest — drops job completions from earlier
 * messages until a reload. The server still owns creation/expiry.
 */
describe("orchestrator session reuse (#347)", () => {
  const realFetch = globalThis.fetch;
  let bodies: any[] = [];

  beforeEach(() => {
    bodies = [];
    (globalThis as any).fetch = async (_input: any, init: any) => {
      try {
        bodies.push(JSON.parse(String(init?.body || "{}")));
      } catch {
        bodies.push({});
      }
      return {
        ok: true,
        json: async () => ({ success: true, messageId: "msg-test-1", sessionId: bodies.at(-1)?.sessionId || "sess-new" }),
      };
    };
    useConversationStore.setState({
      draft: "",
      stagedAttachments: [],
      isStreaming: false,
      messages: [],
      orchestratorSessionId: null,
    } as any);
  });

  afterEach(() => {
    (globalThis as any).fetch = realFetch;
    useConversationStore.setState({ messages: [], orchestratorSessionId: null } as any);
  });

  it("sends the stored session with every message", async () => {
    useConversationStore.setState({ orchestratorSessionId: "sess-stable" } as any);
    await useConversationStore.getState().sendMessage("hello");
    expect(bodies.length).toBeGreaterThan(0);
    expect(bodies.at(-1)?.sessionId).toBe("sess-stable");
    // The echoed session stays stored; the stream follows it.
    expect(useConversationStore.getState().orchestratorSessionId).toBe("sess-stable");
  });

  it("omits the session on first run and stores the minted one", async () => {
    await useConversationStore.getState().sendMessage("first hello");
    expect(bodies.length).toBeGreaterThan(0);
    expect(bodies.at(-1)?.sessionId).toBeUndefined();
    expect(useConversationStore.getState().orchestratorSessionId).toBe("sess-new");
  });
});
