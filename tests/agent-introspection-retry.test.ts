import { describe, it, expect, beforeEach, afterEach } from "vitest";
import app from "../server/index";
import {
  appendCityMessage,
  getCityConversationMessages,
  clearCityConversation,
} from "../server/workspace/conversations";
import { inspect_execution } from "../server/agent/tools/inspect_execution";
import { list_recent_executions } from "../server/agent/tools/list_recent_executions";
import { capabilityBus } from "../server/plugins/bus";
import { runAgentLoop } from "../server/agent/loop";
import { db } from "../server/workspace/db";
import { z } from "zod";

describe("Agent Introspection, Per-City Conversation & Failure Retry (Issue #50)", () => {
  const testCity = "city_retro_test";

  beforeEach(() => {
    clearCityConversation(testCity);
    db.query("DELETE FROM executions WHERE plugin_id = 'test_introspection'").run();
  });

  afterEach(() => {
    clearCityConversation(testCity);
    db.query("DELETE FROM executions WHERE plugin_id = 'test_introspection'").run();
  });

  describe("Per-City Conversation Persistence", () => {
    it("persists conversation messages in SQLite and retrieves them chronologically", () => {
      const msg1 = appendCityMessage(testCity, "user", "What are the core Stoic virtues?");
      const msg2 = appendCityMessage(
        testCity,
        "assistant",
        "The core virtues are Wisdom, Courage, Justice, and Temperance."
      );

      expect(msg1.id).toBeDefined();
      expect(msg2.id).toBeDefined();

      const messages = getCityConversationMessages(testCity);
      expect(messages.length).toBe(2);
      expect(messages[0].role).toBe("user");
      expect(messages[0].content).toContain("core Stoic virtues");
      expect(messages[1].role).toBe("assistant");
      expect(messages[1].content).toContain("Wisdom, Courage");
    });

    it("manages conversation history via REST endpoints GET, POST, and DELETE /api/cities/:id/conversation", async () => {
      // POST message
      const postRes = await app.fetch(
        new Request(`http://localhost:3000/api/cities/${testCity}/conversation`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            role: "user",
            content: "Synthesize flashcards for this city.",
          }),
        })
      );
      expect(postRes.status).toBe(201);

      // GET conversation
      const getRes = await app.fetch(
        new Request(`http://localhost:3000/api/cities/${testCity}/conversation`)
      );
      expect(getRes.status).toBe(200);
      const getData = (await getRes.json()) as any;
      expect(getData.success).toBe(true);
      expect(getData.messages.length).toBe(1);
      expect(getData.messages[0].content).toBe("Synthesize flashcards for this city.");

      // DELETE conversation
      const delRes = await app.fetch(
        new Request(`http://localhost:3000/api/cities/${testCity}/conversation`, {
          method: "DELETE",
        })
      );
      expect(delRes.status).toBe(200);

      const emptyRes = await app.fetch(
        new Request(`http://localhost:3000/api/cities/${testCity}/conversation`)
      );
      const emptyData = (await emptyRes.json()) as any;
      expect(emptyData.messages.length).toBe(0);
    });

    it("automatically persists user prompts and assistant responses in runAgentLoop when cityId is provided", async () => {
      const mockLlm = {
        chat: {
          completions: {
            create: async () => ({
              choices: [
                {
                  message: {
                    content: "Hello! Stoic virtue is cultivated daily.",
                    tool_calls: null,
                  },
                },
              ],
            }),
          },
        },
      } as any;

      const events: any[] = [];
      await runAgentLoop({
        prompt: "Hello Stoicism City",
        cityId: testCity,
        history: [],
        llmClient: mockLlm,
        onEvent: (evt) => {
          events.push(evt);
        },
      });

      const messages = getCityConversationMessages(testCity);
      expect(messages.length).toBe(2);
      expect(messages[0].role).toBe("user");
      expect(messages[0].content).toBe("Hello Stoicism City");
      expect(messages[1].role).toBe("assistant");
      expect(messages[1].content).toContain("Stoic virtue is cultivated daily");
    });
  });

  describe("Execution Introspection Tools", () => {
    it("inspects successful and failed executions via inspect_execution", async () => {
      const capId = "test_introspection.calculate";
      capabilityBus.register("test_introspection", {
        id: capId,
        title: "Calculate",
        description: "Calculates quotient",
        risk: "read",
        input: z.object({ a: z.number(), b: z.number() }),
      }, async (input) => {
        if (input.b === 0) {
          throw new Error("Division by zero error");
        }
        return { result: input.a / input.b };
      });

      // 1. Successful execution
      const successRes = await capabilityBus.invoke(capId, { a: 10, b: 2 }, {
        actor: "user",
        cityId: testCity,
      });
      expect(successRes.success).toBe(true);

      const inspectSuccess = (await inspect_execution.execute(
        { executionId: successRes.executionId },
        { step: 1 }
      )) as any;
      expect(inspectSuccess.success).toBe(true);
      expect(inspectSuccess.execution.status).toBe("success");
      expect(inspectSuccess.execution.input).toEqual({ a: 10, b: 2 });
      expect(inspectSuccess.execution.output).toEqual({ result: 5 });

      // 2. Failed execution
      const failRes = await capabilityBus.invoke(capId, { a: 10, b: 0 }, {
        actor: "user",
        cityId: testCity,
      });
      expect(failRes.success).toBe(false);

      const inspectFail = (await inspect_execution.execute(
        { executionId: failRes.executionId },
        { step: 2 }
      )) as any;
      expect(inspectFail.success).toBe(true);
      expect(inspectFail.execution.status).toBe("failed");
      expect(inspectFail.execution.error).toContain("Division by zero error");
    });

    it("filters recent executions via list_recent_executions", async () => {
      const capId = "test_introspection.action";
      capabilityBus.register("test_introspection", {
        id: capId,
        title: "Action",
        description: "Test action",
        risk: "read",
        input: z.object({ ok: z.boolean() }),
      }, async (input) => {
        if (!input.ok) throw new Error("Explicit failure");
        return { done: true };
      });

      await capabilityBus.invoke(capId, { ok: true }, { actor: "user", cityId: testCity });
      await capabilityBus.invoke(capId, { ok: false }, { actor: "user", cityId: testCity });

      const listAll = (await list_recent_executions.execute(
        { cityId: testCity, pluginId: "test_introspection", status: "all" },
        { step: 1 }
      )) as any;
      expect(listAll.success).toBe(true);
      expect(listAll.executions.length).toBe(2);

      const listFailed = (await list_recent_executions.execute(
        { cityId: testCity, pluginId: "test_introspection", status: "failed" },
        { step: 2 }
      )) as any;
      expect(listFailed.success).toBe(true);
      expect(listFailed.executions.length).toBe(1);
      expect(listFailed.executions[0].status).toBe("failed");
      expect(listFailed.executions[0].error).toContain("Explicit failure");
    });
  });
});
