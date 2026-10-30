import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";
import { enter_city } from "../server/agent/tools/enter_city";
import { adaptBackendEvent } from "../src/lib/agent/events";
import { runAgentLoop, type AgentStepEvent } from "../server/agent/loop";
import { db } from "../server/workspace/db";

const TEST_CITY = "test-city-enter";
const TEST_DIR = path.resolve(process.cwd(), "workspace", TEST_CITY);

describe("enter_city: open city content inside the city", () => {
  beforeAll(async () => {
    await fs.mkdir(TEST_DIR, { recursive: true });
    db.query(
      "INSERT OR REPLACE INTO cities (id, title, region, level, tags, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(TEST_CITY, "Test Enter City", "Core Region", 1, "[]", Math.floor(Date.now() / 1000));
  });

  afterAll(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true }).catch(() => {});
    db.query("DELETE FROM cities WHERE id = ?").run(TEST_CITY);
  });

  it("enters an existing city workspace", async () => {
    const res = (await enter_city.execute(
      { cityId: TEST_CITY },
      { step: 1 }
    )) as any;
    expect(res.success).toBe(true);
    expect(res.action).toBe("city.enter");
    expect(res.cityId).toBe(TEST_CITY);
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
                          function: { name: "enter_city", arguments: `{"cityId":"${TEST_CITY}"}` },
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
      prompt: `Open the study guide in ${TEST_CITY}`,
      llmClient: llm,
      onEvent: (e) => void events.push(e),
    });
    expect(result.status).toBe("completed");
    const entered = events.find((e) => e.type === "city.enter");
    expect(entered).toBeDefined();
    expect((entered?.payload as any)?.cityId).toBe(TEST_CITY);
  });
});
