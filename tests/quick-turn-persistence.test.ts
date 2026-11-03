import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { queueMessage } from "../server/agent/orchestrator";
import { getAgentThreadSnapshot, clearAgentThread } from "../server/workspace/thread";
import { db } from "../server/workspace/db";


const WS = "ws-thread-quick";
const TU = "thread_plumb_quick";

function mockReply(text: string): any {
  return {
    chat: {
      completions: {
        create: async () => ({
          choices: [{ message: { role: "assistant", content: text } }],
        }),
      },
    },
  };
}

async function waitFor(cond: () => boolean, timeoutMs = 8000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (cond()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("timed out waiting for condition");
}

/**
 * Quick-turn thread persistence (#307): the chat UI path must write the
 * prompt and reply to the caller thread, or reloads show an empty chat.
 * Uses the real loop with a stubbed model (no tools called).
 */
describe("quick-turn thread persistence (#307)", () => {
  beforeEach(() => {
    clearAgentThread(TU);
  });
  afterEach(() => {
    clearAgentThread(TU);
    try {
      db.query("DELETE FROM sessions WHERE workspace_id = ?").run(WS);
    } catch {}
    try {
      db.query("DELETE FROM message_queue WHERE workspace_id = ?").run(WS);
    } catch {}
  });

  it("persists the quick-turn prompt and reply to the caller thread", async () => {
    const { messageId, sessionId } = queueMessage({
      workspaceId: WS,
      userId: TU,
      prompt: "plumbing probe",
      llmClient: mockReply("plumbing reply"),
    });
    expect(typeof messageId).toBe("string");

    await waitFor(() => {
      const snap = getAgentThreadSnapshot(TU);
      const contents = snap.page.messages.map((m) => m.content);
      return contents.includes("plumbing probe") && contents.includes("plumbing reply");
    });

    const snap = getAgentThreadSnapshot(TU);
    const contents = snap.page.messages.map((m) => m.content);
    expect(contents).toContain("plumbing probe");
    expect(contents).toContain("plumbing reply");

    // The queue row carries the owner for restart recovery.
    const row = db.query("SELECT user_id FROM message_queue WHERE id = ?").get(messageId) as any;
    expect(row?.user_id).toBe(TU);
    expect(typeof sessionId).toBe("string");
  });
});
