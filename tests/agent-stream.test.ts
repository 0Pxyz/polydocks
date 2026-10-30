import { describe, it, expect } from "bun:test";
import { runAgentLoop, type AgentStepEvent } from "../server/agent/loop";

function gen(chunks: any[]) {
  return (async function* () {
    for (const c of chunks) yield c;
  })();
}

const usageChunk = (inTok = 7, outTok = 3) => ({
  choices: [{ delta: {}, finish_reason: "stop", index: 0 }],
  usage: { prompt_tokens: inTok, completion_tokens: outTok },
});

describe("Agent streaming: text deltas and streamed tool calls", () => {
  it("forwards text deltas in order and assembles the full reply", async () => {
    const events: AgentStepEvent[] = [];
    const llm: any = {
      chat: {
        completions: {
          create: async (params: any) =>
            params.stream
              ? gen([
                  { choices: [{ delta: { content: "Hel" } }] },
                  { choices: [{ delta: { content: "lo " } }] },
                  { choices: [{ delta: { content: "there" } }] },
                  usageChunk(),
                ])
              : { choices: [{ message: { role: "assistant", content: "unreachable" } }] },
        },
      },
    };
    const result = await runAgentLoop({
      prompt: "Say hi",
      llmClient: llm,
      onEvent: (e) => void events.push(e),
    });
    expect(result.status).toBe("completed");
    expect(result.text).toBe("Hello there");
    const deltas = events
      .filter((e) => e.type === "agent.text_delta")
      .map((e) => (e.payload as any)?.delta);
    expect(deltas).toEqual(["Hel", "lo ", "there"]);
  });

  it("accumulates streamed tool calls and executes them", async () => {
    const events: AgentStepEvent[] = [];
    let calls = 0;
    const llm: any = {
      chat: {
        completions: {
          create: async (params: any) => {
            calls++;
            if (!params.stream) throw new Error("expected stream:true");
            if (calls === 1) {
              return gen([
                { choices: [{ delta: { tool_calls: [{ index: 0, id: "call_9", function: { name: "list_files" } }] } }] },
                { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"dir":' } }] } }] },
                { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"default"}' } }] } }] },
                usageChunk(),
              ]);
            }
            return gen([{ choices: [{ delta: { content: "Listed." } }] }, usageChunk()]);
          },
        },
      },
    };
    const result = await runAgentLoop({
      prompt: "List files",
      llmClient: llm,
      onEvent: (e) => void events.push(e),
    });
    expect(result.status).toBe("completed");
    expect(result.text).toBe("Listed.");
    const start = events.find((e) => e.type === "tool.start");
    expect((start?.payload as any)?.name).toBe("list_files");
    // Arguments arrived in 3 streamed fragments; the tool ran once, assembled.
    expect(events.filter((e) => e.type === "tool.start").length).toBe(1);
    const deltas = events.filter((e) => e.type === "agent.text_delta");
    expect(deltas.map((e) => (e.payload as any)?.delta).join("")).toBe("Listed.");
  });

  it("reports streamed usage in agent.finish", async () => {
    const events: AgentStepEvent[] = [];
    const llm: any = {
      chat: {
        completions: {
          create: async () => gen([{ choices: [{ delta: { content: "Hi" } }] }, usageChunk(11, 4)]),
        },
      },
    };
    await runAgentLoop({
      prompt: "Hi",
      llmClient: llm,
      onEvent: (e) => void events.push(e),
    });
    const finish = events.find((e) => e.type === "agent.finish");
    expect((finish?.payload as any)?.inputTokens).toBe(11);
    expect((finish?.payload as any)?.outputTokens).toBe(4);
  });

  it("falls back to a single call when the provider refuses streams", async () => {
    const events: AgentStepEvent[] = [];
    const llm: any = {
      chat: {
        completions: {
          create: async (params: any) => {
            if (params.stream) throw new Error("streaming not supported");
            return {
              choices: [{ message: { role: "assistant", content: "Legacy ok." } }],
              usage: { prompt_tokens: 1, completion_tokens: 1 },
            };
          },
        },
      },
    };
    const result = await runAgentLoop({
      prompt: "Hi",
      llmClient: llm,
      onEvent: (e) => void events.push(e),
    });
    expect(result.status).toBe("completed");
    expect(result.text).toBe("Legacy ok.");
  });

  it("keeps working with legacy object responses (existing mocks)", async () => {
    const events: AgentStepEvent[] = [];
    const llm: any = {
      chat: {
        completions: {
          create: async () => ({
            choices: [{ message: { role: "assistant", content: "Plain." } }],
          }),
        },
      },
    };
    const result = await runAgentLoop({
      prompt: "Hi",
      llmClient: llm,
      onEvent: (e) => void events.push(e),
    });
    expect(result.status).toBe("completed");
    expect(result.text).toBe("Plain.");
  });
});
