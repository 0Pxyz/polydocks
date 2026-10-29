import { describe, expect, test } from "bun:test";
import { runAgentLoop } from "../server/agent/loop";

function mockLlm(captured: any[]) {
  return {
    chat: {
      completions: {
        create: async (params: any) => {
          captured.push(params);
          return {
            choices: [{ message: { role: "assistant", content: "Done." } }],
          };
        },
      },
    },
  } as any;
}

describe("Reasoning Effort plumbing (dev.meta.ai/docs/reasoning)", () => {
  test("passes a valid effort as reasoning_effort on the model call", async () => {
    const captured: any[] = [];
    const result = await runAgentLoop({
      prompt: "Prove sqrt(2) is irrational",
      llmClient: mockLlm(captured),
      reasoningEffort: "high",
      onEvent: () => {},
    });
    expect(result.status).toBe("completed");
    expect(captured.length).toBeGreaterThan(0);
    expect(captured[0].reasoning_effort).toBe("high");
  });

  test("omits reasoning_effort when effort is auto", async () => {
    const captured: any[] = [];
    await runAgentLoop({
      prompt: "Hi",
      llmClient: mockLlm(captured),
      reasoningEffort: "auto",
      onEvent: () => {},
    });
    expect(captured.length).toBeGreaterThan(0);
    expect("reasoning_effort" in captured[0]).toBe(false);
  });

  test("omits reasoning_effort when effort is absent", async () => {
    const captured: any[] = [];
    await runAgentLoop({
      prompt: "Hi",
      llmClient: mockLlm(captured),
      onEvent: () => {},
    });
    expect("reasoning_effort" in captured[0]).toBe(false);
  });

  test("drops values outside the allowlist (e.g. none, turbo)", async () => {
    for (const bad of ["none", "turbo", "", "HIGH"]) {
      const captured: any[] = [];
      await runAgentLoop({
        prompt: "Hi",
        llmClient: mockLlm(captured),
        reasoningEffort: bad,
        onEvent: () => {},
      });
      expect("reasoning_effort" in captured[0]).toBe(false);
    }
  });
});
