import { describe, expect, it } from "bun:test";
import { z } from "zod";
import { runAgentLoop, type AgentStepEvent } from "./loop";
import type { AgentTool } from "./tools/types";

/** End-to-end loop coverage over the Responses path (#221). */
describe("Agent loop over Responses API", () => {
  it("completes with text when the model makes no function calls", async () => {
    const events: AgentStepEvent[] = [];
    const mockClient: any = {
      responses: {
        create: async () => ({
          id: "resp_text",
          usage: { input_tokens: 12, output_tokens: 4 },
          output: [{ type: "message", content: [{ type: "output_text", text: "Hello over Responses." }] }],
        }),
      },
    };
    const result = await runAgentLoop({
      prompt: "Hello",
      llmClient: mockClient,
      onEvent: (e) => events.push(e),
    });
    expect(result.status).toBe("completed");
    expect(result.text).toContain("Hello over Responses");
    expect(events.map((e) => e.type)).toContain("agent.finish");
  });

  it("executes a function call and pairs output with the same call_id", async () => {
    const events: AgentStepEvent[] = [];
    let calls = 0;
    const mockTool: AgentTool<{ id: string }> = {
      name: "dock.open",
      description: "Open a dock tool",
      schema: z.object({ id: z.string() }),
      execute: async () => ({ ok: true, id: "notes" }),
    };
    const mockClient: any = {
      responses: {
        create: async (params: any) => {
          calls++;
          // Instructions, tools and reasoning are resent every turn.
          expect(params.instructions).toBeString();
          if (calls === 1) {
            expect(params.store).toBe(false);
            expect(params.tool_choice).toBe("auto");
            return {
              id: "resp_call",
              usage: { input_tokens: 10, output_tokens: 10 },
              output: [
                {
                  type: "function_call",
                  call_id: "call_resp_1",
                  name: "dock.open",
                  arguments: JSON.stringify({ id: "notes" }),
                },
              ],
            };
          }
          // Second turn replays the function_call_output in the input.
          const types = (params.input as any[]).map((i) => i.type);
          expect(types).toContain("function_call");
          expect(types).toContain("function_call_output");
          return {
            id: "resp_done",
            usage: { input_tokens: 10, output_tokens: 5 },
            output: [{ type: "message", content: [{ type: "output_text", text: "Notes is open." }] }],
          };
        },
      },
    };
    const result = await runAgentLoop({
      prompt: "Open the notes tab",
      tools: [mockTool],
      llmClient: mockClient,
      onEvent: (e) => events.push(e),
    });
    expect(result.status).toBe("completed");
    expect(result.text).toContain("Notes is open");
    const starts = events.filter((e) => e.type === "tool.start");
    const dones = events.filter((e) => e.type === "tool.done");
    expect(starts).toHaveLength(1);
    expect(dones).toHaveLength(1);
    expect(dones[0].payload?.id).toBe("call_resp_1");
    expect(dones[0].payload?.name).toBe("dock.open");
  });
});
