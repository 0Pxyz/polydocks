import { describe, it, expect } from "bun:test";
import { runAgentLoop, type AgentStepEvent } from "../server/agent/loop";

/** Fake model: sleeps, then answers in text. Honors abort like the OpenAI client. */
function slowLlm(ms: number) {
  const llm: any = {
    chat: {
      completions: {
        create: async (_params: any, reqOpt?: any) => {
          const signal = reqOpt?.signal as AbortSignal | undefined;
          if (signal?.aborted) {
            throw Object.assign(new Error("aborted"), { name: "AbortError" });
          }
          await new Promise<void>((resolve, reject) => {
            const t = setTimeout(resolve, ms);
            signal?.addEventListener(
              "abort",
              () => {
                clearTimeout(t);
                reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
              },
              { once: true }
            );
          });
          return {
            choices: [{ message: { role: "assistant", content: "Done." } }],
            usage: { prompt_tokens: 10, completion_tokens: 2 },
          };
        },
      },
    },
  };
  return llm;
}

/** Scripted model: one tool call, then text. */
function toolLlm() {
  let n = 0;
  const llm: any = {
    chat: {
      completions: {
        create: async () => {
          n++;
          if (n === 1) {
            return {
              choices: [
                {
                  message: {
                    role: "assistant",
                    content: null,
                    tool_calls: [
                      {
                        id: "call_1",
                        type: "function",
                        function: { name: "list_files", arguments: "{}" },
                      },
                    ],
                  },
                },
              ],
              usage: { prompt_tokens: 10, completion_tokens: 5 },
            };
          }
          return {
            choices: [{ message: { role: "assistant", content: "Listed." } }],
            usage: { prompt_tokens: 10, completion_tokens: 2 },
          };
        },
      },
    },
  };
  return llm;
}

describe("Agent progress: heartbeat, ordering, no-leak, cancel", () => {
  it("emits thinking heartbeats every ~2s during a slow model call", async () => {
    const events: AgentStepEvent[] = [];
    const result = await runAgentLoop({
      prompt: "Say hi",
      llmClient: slowLlm(4500),
      onEvent: (e) => void events.push(e),
    });
    const beats = events.filter((e) => e.type === "agent.heartbeat");
    expect(beats.length).toBeGreaterThanOrEqual(2);
    for (const b of beats) {
      expect((b.payload as any)?.phase).toBe("thinking");
      expect(typeof (b.payload as any)?.elapsedMs).toBe("number");
    }
    const elapsed = beats.map((b) => (b.payload as any).elapsedMs as number);
    for (let i = 1; i < elapsed.length; i++) {
      expect(elapsed[i]).toBeGreaterThan(elapsed[i - 1]);
    }
    expect(result.status).toBe("completed");
  }, 15000);

  it("orders tool.start -> tool.done (with durationMs) -> finish", async () => {
    const events: AgentStepEvent[] = [];
    const result = await runAgentLoop({
      prompt: "List files",
      llmClient: toolLlm(),
      onEvent: (e) => void events.push(e),
    });
    expect(result.status).toBe("completed");
    const types = events.map((e) => e.type);
    expect(types[0]).toBe("agent.start");
    expect(types).toContain("tool.start");
    expect(types).toContain("tool.done");
    expect(types[types.length - 1]).toBe("agent.finish");
    expect(types.indexOf("tool.start")).toBeLessThan(types.indexOf("tool.done"));
    const done = events.find((e) => e.type === "tool.done");
    expect(typeof (done?.payload as any)?.durationMs).toBe("number");
  });

  it("never puts prompt text or code in heartbeat payloads", async () => {
    const events: AgentStepEvent[] = [];
    const secret = "SECRET-PROMPT-UNIQUE-STRING-12345";
    await runAgentLoop({
      prompt: `Please handle ${secret} carefully`,
      llmClient: slowLlm(2500),
      onEvent: (e) => void events.push(e),
    });
    const beats = events.filter((e) => e.type === "agent.heartbeat");
    expect(beats.length).toBeGreaterThanOrEqual(1);
    for (const b of beats) {
      expect(JSON.stringify(b.payload)).not.toContain(secret);
      expect(JSON.stringify(b.payload)).not.toContain("Please handle");
    }
  }, 15000);

  it("honors an aborted signal mid-model-call", async () => {
    const events: AgentStepEvent[] = [];
    const ctrl = new AbortController();
    const llm: any = {
      chat: {
        completions: {
          create: (_p: any, reqOpt?: any) => {
            const signal = (reqOpt?.signal as AbortSignal | undefined) ?? ctrl.signal;
            return new Promise((_resolve, reject) => {
              const t = setTimeout(() => reject(new Error("should have aborted")), 8000);
              signal.addEventListener(
                "abort",
                () => {
                  clearTimeout(t);
                  reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
                },
                { once: true }
              );
            });
          },
        },
      },
    };
    // Abort while the loop is still awaiting the (8s) model call.
    setTimeout(() => ctrl.abort(), 300);
    const result = await runAgentLoop({
      prompt: "Slow task",
      llmClient: llm,
      signal: ctrl.signal,
      onEvent: (e) => void events.push(e),
    });
    expect(result.status).toBe("error");
    expect(result.error).toBe("Execution cancelled");
    expect(events.some((e) => e.type === "agent.finish")).toBe(false);
  });
});
