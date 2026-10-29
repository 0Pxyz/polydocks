import { describe, it, expect } from "bun:test";
import { enter_city } from "../server/agent/tools/enter_city";
import { adaptBackendEvent } from "../src/lib/agent/events";
import { runAgentLoop, type AgentStepEvent } from "../server/agent/loop";

describe("enter_city: open city content inside the city", () => {
  it("enters an existing city workspace", async () => {
    const res = (await enter_city.execute(
      { cityId: "stoicism" },
      { step: 1 }
    )) as any;
    expect(res.success).toBe(true);
    expect(res.action).toBe("city.enter");
    expect(res.cityId).toBe("stoicism");
  });

  it("refuses unknown cities with a retryable error and a hint", async () => {
    const res = (await enter_city.execute(
      { cityId: "no-such-city-xyz" },
      { step: 1 }
    )) as any;
    expect(res.error).toContain("no-such-city-xyz");
    expect(res.retryable).toBe(true);
    expect(res.action).toBeUndefined();
  });

  it("adapts city.enter to a city.entered UI event", () => {
    const ui = adaptBackendEvent({
      type: "city.enter",
      step: 2,
      payload: { cityId: "biohacking" },
    });
    expect(ui?.type).toBe("city.entered");
    if (ui?.type === "city.entered") {
      expect(ui.cityId).toBe("biohacking");
    }
  });

  it("loop emits city.enter when the agent enters a city", async () => {
    const events: AgentStepEvent[] = [];
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
                          id: "call_enter",
                          type: "function",
                          function: { name: "enter_city", arguments: '{"cityId":"stoicism"}' },
                        },
                      ],
                    },
                  },
                ],
              };
            }
            return { choices: [{ message: { role: "assistant", content: "Entered." } }] };
          },
        },
      },
    };
    const result = await runAgentLoop({
      prompt: "Open the study guide in stoicism",
      llmClient: llm,
      onEvent: (e) => void events.push(e),
    });
    expect(result.status).toBe("completed");
    const entered = events.find((e) => e.type === "city.enter");
    expect(entered).toBeDefined();
    expect((entered?.payload as any)?.cityId).toBe("stoicism");
  });
});
