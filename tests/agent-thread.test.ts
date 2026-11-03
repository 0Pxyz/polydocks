import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import app from "../server/index";
import { config } from "../server/config";
import { runAgentLoop } from "../server/agent/loop";
import { maybeCompactAgentThread } from "../server/agent/threadCompaction";
import {
  appendThreadMessage,
  clearAgentThread,
  deleteThreadMessage,
  getAgentThread,
  getAgentThreadSnapshot,
  getOlderThreadMessages,
  getThreadContext,
  rewindLastThreadTurn,
} from "../server/workspace/thread";

const TEST_USER = "thread_test_user";
const OTHER_USER = "thread_test_other";

function clearAll() {
  clearAgentThread(TEST_USER);
  clearAgentThread(OTHER_USER);
}

function requestThread(path = "/api/agent/thread", init?: RequestInit) {
  return app.fetch(
    new Request(`http://localhost:3000${path}`, {
      ...init,
      headers: {
        "X-Polymax-User": TEST_USER,
        ...(init?.headers as Record<string, string> | undefined),
      },
    })
  );
}

describe("Single persistent agent thread", () => {
  beforeEach(clearAll);
  afterEach(clearAll);

  it("stores one ordered transcript per user", () => {
    appendThreadMessage(TEST_USER, "user", "First question");
    appendThreadMessage(TEST_USER, "assistant", "First answer");
    appendThreadMessage(TEST_USER, "user", "Second question");

    const { thread, page } = getAgentThreadSnapshot(TEST_USER);
    expect(thread.userId).toBe(TEST_USER);
    expect(page.messages.map((m) => m.content)).toEqual([
      "First question",
      "First answer",
      "Second question",
    ]);
    expect(page.messages[0].seq).toBeLessThan(page.messages[1].seq);
    expect(page.hasMore).toBe(false);
  });

  it("never leaks one user's thread into another user", () => {
    appendThreadMessage(TEST_USER, "user", "Private note");

    const other = getAgentThreadSnapshot(OTHER_USER);
    expect(other.page.messages).toHaveLength(0);
    expect(getAgentThread(OTHER_USER).id).not.toBe(getAgentThread(TEST_USER).id);
  });

  it("pages backwards inside the same thread", () => {
    for (let i = 0; i < 10; i++) {
      appendThreadMessage(TEST_USER, i % 2 === 0 ? "user" : "assistant", `Turn ${i}`);
    }

    const latest = getAgentThreadSnapshot(TEST_USER, { limit: 4 });
    expect(latest.page.messages.map((m) => m.content)).toEqual([
      "Turn 6",
      "Turn 7",
      "Turn 8",
      "Turn 9",
    ]);
    expect(latest.page.hasMore).toBe(true);

    const older = getOlderThreadMessages(TEST_USER, {
      beforeSeq: latest.page.nextBefore as number,
      limit: 3,
    });
    expect(older.messages.map((m) => m.content)).toEqual(["Turn 3", "Turn 4", "Turn 5"]);
    expect(older.hasMore).toBe(true);
  });

  it("bounds the model context and prefers the newest turns", () => {
    for (let i = 0; i < 30; i++) {
      appendThreadMessage(TEST_USER, "user", `Message ${i} ${"x".repeat(300)}`);
    }

    const context = getThreadContext(TEST_USER, { maxMessages: 6, tokenBudget: 400 });
    expect(context.messages.length).toBeLessThan(30);
    expect(context.messages.length).toBeGreaterThan(0);
    expect(context.messages[context.messages.length - 1].content).toContain("Message 29");
    expect(context.pendingMessages).toBe(30);
    expect(context.totalMessages).toBe(30);
  });

  it("folds old turns into a rolling summary and excludes them afterwards", async () => {
    for (let i = 0; i < 30; i++) {
      appendThreadMessage(TEST_USER, i % 2 === 0 ? "user" : "assistant", `Turn ${i}`);
    }

    let captured = "";
    const mockLlm: any = {
      chat: {
        completions: {
          create: async (params: any) => {
            captured = JSON.stringify(params.messages);
            return { choices: [{ message: { content: "Summary of turns 0-20." } }] };
          },
        },
      },
    };

    const compacted = await maybeCompactAgentThread({
      userId: TEST_USER,
      llmClient: mockLlm,
      modelId: "test-model",
      threshold: 10,
      keepRecent: 5,
    });

    expect(compacted).toBe(true);
    expect(captured).toContain("Turn 0");
    expect(captured).toContain("Existing summary");

    const thread = getAgentThread(TEST_USER);
    expect(thread.summary).toBe("Summary of turns 0-20.");
    expect(thread.summaryThroughSeq).toBeGreaterThan(0);

    const context = getThreadContext(TEST_USER);
    expect(context.summary).toBe("Summary of turns 0-20.");
    expect(context.messages.length).toBe(5);
    expect(context.messages[context.messages.length - 1].content).toBe("Turn 29");
    expect(context.pendingMessages).toBe(5);
    expect(context.totalMessages).toBe(30);
  });

  it("rewinds the last completed turn before a retry", () => {
    appendThreadMessage(TEST_USER, "user", "Earlier");
    appendThreadMessage(TEST_USER, "assistant", "Earlier answer");
    appendThreadMessage(TEST_USER, "user", "Please retry this");
    appendThreadMessage(TEST_USER, "assistant", "First attempt");

    const removed = rewindLastThreadTurn(TEST_USER);
    expect(removed).toBe(2);

    const { page } = getAgentThreadSnapshot(TEST_USER);
    expect(page.messages.map((m) => m.content)).toEqual(["Earlier", "Earlier answer"]);
  });

  it("rolls back a single failed prompt without touching the rest", () => {
    appendThreadMessage(TEST_USER, "user", "Keep me");
    const doomed = appendThreadMessage(TEST_USER, "user", "Drop me");

    expect(deleteThreadMessage(TEST_USER, doomed.id)).toBe(true);

    const { page } = getAgentThreadSnapshot(TEST_USER);
    expect(page.messages.map((m) => m.content)).toEqual(["Keep me"]);
  });

  it("serves, pages and clears the thread over HTTP", async () => {
    // Per-user thread isolation is a cloud-mode behavior: local mode pins
    // every request to the single-user demo identity (DEPLOY_MODE=local).
    // Flip to cloud for this HTTP round-trip so the X-Polymax-User header
    // scopes the thread, then restore.
    const prevMode = config.DEPLOY_MODE;
    (config as any).DEPLOY_MODE = "cloud";
    try {
      appendThreadMessage(TEST_USER, "user", "Hello");
      appendThreadMessage(TEST_USER, "assistant", "Hi");

      const getRes = await requestThread();
      expect(getRes.status).toBe(200);
      const snapshot = (await getRes.json()) as any;
      expect(snapshot.thread.userId).toBe(TEST_USER);
      expect(snapshot.messages).toHaveLength(2);

      const before = snapshot.messages[0].seq;
      const pageRes = await requestThread(`/api/agent/thread/messages?before=${before}&limit=1`);
      expect(pageRes.status).toBe(200);

      const delRes = await requestThread("/api/agent/thread", { method: "DELETE" });
      expect(delRes.status).toBe(200);

      const after = (await (await requestThread()).json()) as any;
      expect(after.messages).toHaveLength(0);
      expect(after.thread.id).toBe(snapshot.thread.id);
    } finally {
      (config as any).DEPLOY_MODE = prevMode;
    }
  });
});

describe("Agent loop thread integration", () => {
  beforeEach(clearAll);
  afterEach(clearAll);

  it("continues from the stored thread without client history", async () => {
    const captured: any[] = [];
    const mockLlm: any = {
      chat: {
        completions: {
          create: async (params: any) => {
            captured.push(params.messages);
            const isFirst = captured.length === 1;
            return {
              choices: [
                {
                  message: {
                    role: "assistant",
                    content: isFirst ? "Stoicism starts with the dichotomy of control." : "It continues with virtue.",
                  },
                },
              ],
            };
          },
        },
      },
    };

    await runAgentLoop({
      prompt: "Teach me Stoicism",
      userId: TEST_USER,
      llmClient: mockLlm,
      onEvent: () => {},
    });

    await runAgentLoop({
      prompt: "And then?",
      userId: TEST_USER,
      history: [],
      llmClient: mockLlm,
      onEvent: () => {},
    });

    const secondCall = captured[1];
    const contents = secondCall.map((m: any) =>
      typeof m.content === "string" ? m.content : JSON.stringify(m.content)
    );
    expect(contents).toContain("Teach me Stoicism");
    expect(contents).toContain("Stoicism starts with the dichotomy of control.");
    expect(contents[contents.length - 1]).toBe("And then?");

    const { page } = getAgentThreadSnapshot(TEST_USER);
    expect(page.messages.map((m) => m.content)).toEqual([
      "Teach me Stoicism",
      "Stoicism starts with the dichotomy of control.",
      "And then?",
      "It continues with virtue.",
    ]);
  });

  it("does not duplicate the prompt after a failed model call", async () => {
    const mockLlm: any = {
      chat: {
        completions: {
          create: async () => {
            throw new Error("upstream exploded");
          },
        },
      },
    };

    const result = await runAgentLoop({
      prompt: "This will fail",
      userId: TEST_USER,
      llmClient: mockLlm,
      onEvent: () => {},
    });

    expect(result.status).toBe("error");
    expect(getAgentThreadSnapshot(TEST_USER).page.messages).toHaveLength(0);
  });

  it("keeps one copy of the prompt when retrying a turn", async () => {
    let attempt = 0;
    const mockLlm: any = {
      chat: {
        completions: {
          create: async () => {
            attempt++;
            return {
              choices: [{ message: { role: "assistant", content: `Answer ${attempt}` } }],
            };
          },
        },
      },
    };

    await runAgentLoop({
      prompt: "Repeatable",
      userId: TEST_USER,
      llmClient: mockLlm,
      onEvent: () => {},
    });

    await runAgentLoop({
      prompt: "Repeatable",
      userId: TEST_USER,
      retryLast: true,
      llmClient: mockLlm,
      onEvent: () => {},
    });

    const { page } = getAgentThreadSnapshot(TEST_USER);
    expect(page.messages.map((m) => m.content)).toEqual(["Repeatable", "Answer 2"]);
  });
});
