import { describe, expect, it } from "bun:test";
import { z } from "zod";
import {
  createResponsesTurn,
  hasResponsesSurface,
  normalizeCallId,
  normalizeResponsesObject,
  toResponsesName,
  toResponsesTools,
  toResponsesUserContent,
} from "./responses";
import type { AgentTool } from "./tools/types";

function tool(name: string): AgentTool {
  return { name, description: `${name} tool`, schema: z.object({}).passthrough(), execute: async () => ({ ok: true }) };
}

describe("Responses adapter (#221)", () => {
  it("keeps names with at most one dot unchanged", () => {
    expect(toResponsesName("dock.open")).toBe("dock.open");
    expect(toResponsesName("find_capabilities")).toBe("find_capabilities");
  });

  it("sanitizes names with more than one dot reversibly", () => {
    expect(toResponsesName("cap.sources.add")).toBe("cap_sources_add");
  });

  it("maps tools 1:1 with function type and parameters", () => {
    const tools = toResponsesTools([tool("dock.open"), tool("cap.sources.add")]);
    expect(tools[0]).toMatchObject({ type: "function", name: "dock.open" });
    expect(tools[1].name).toBe("cap_sources_add");
    expect(typeof tools[0].parameters).toBe("object");
  });

  it("normalizes call ids to 1-64 chars", () => {
    expect(normalizeCallId("", 3).length).toBeGreaterThan(0);
    expect(normalizeCallId("x".repeat(100), 0)).toHaveLength(64);
    expect(normalizeCallId("call_abc123", 0)).toBe("call_abc123");
  });

  it("converts chat user content to Responses input content", () => {
    expect(toResponsesUserContent("hello")).toBe("hello");
    const out = toResponsesUserContent([
      { type: "text", text: "see this" },
      { type: "image_url", image_url: { url: "data:image/png;base64,xx" } },
    ]) as any[];
    expect(out[0]).toMatchObject({ type: "input_text", text: "see this" });
    expect(out[1]).toMatchObject({ type: "input_image" });
  });

  it("detects the Responses surface", () => {
    expect(hasResponsesSurface({ responses: { create: async () => ({}) } })).toBe(true);
    expect(hasResponsesSurface({ chat: { completions: { create: async () => ({}) } } })).toBe(false);
    expect(hasResponsesSurface({})).toBe(false);
  });

  it("normalizes a plain Responses object", () => {
    const turn = normalizeResponsesObject({
      id: "resp_1",
      usage: { input_tokens: 10, output_tokens: 5 },
      output: [
        { type: "message", content: [{ type: "output_text", text: "hi" }] },
        { type: "function_call", call_id: "call_1", name: "dock.open", arguments: '{"id":"notes"}' },
      ],
    });
    expect(turn.text).toBe("hi");
    expect(turn.functionCalls).toHaveLength(1);
    expect(turn.functionCalls[0]).toMatchObject({ callId: "call_1", name: "dock.open" });
  });

  it("calls Responses with store:false, tool_choice auto, nested reasoning", async () => {
    let seen: any = null;
    const client = {
      responses: {
        create: async (params: any) => {
          seen = params;
          return {
            id: "resp_2",
            usage: { input_tokens: 3, output_tokens: 7 },
            output: [{ type: "message", content: [{ type: "output_text", text: "done" }] }],
          };
        },
      },
    };
    const turn = await createResponsesTurn({
      client: client as any,
      model: "muse-spark-1.3",
      instructions: "sys",
      inputItems: [{ role: "user", content: "hi" }],
      tools: toResponsesTools([tool("dock.open")]),
      effort: "low",
      onTextDelta: () => {},
    });
    expect(turn.text).toBe("done");
    expect(seen.store).toBe(false);
    expect(seen.tool_choice).toBe("auto");
    expect(seen.reasoning).toMatchObject({ effort: "low" });
    expect(seen.reasoning_effort).toBeUndefined();
    expect(seen.instructions).toBe("sys");
    expect(seen.include).toContain("reasoning.encrypted_content");
  });

  it("accumulates streaming deltas and function calls", async () => {
    async function* stream() {
      yield { type: "response.output_text.delta", delta: "hel" };
      yield { type: "response.output_text.delta", delta: "lo" };
      yield {
        type: "response.completed",
        response: {
          id: "resp_3",
          usage: { input_tokens: 1, output_tokens: 2 },
          output: [
            { type: "message", content: [{ type: "output_text", text: "hello" }] },
            { type: "function_call", call_id: "call_s1", name: "dock.open", arguments: "{}" },
          ],
        },
      };
    }
    const deltas: string[] = [];
    const turn = await createResponsesTurn({
      client: { responses: { create: async () => stream() } } as any,
      model: "muse-spark-1.3",
      instructions: "sys",
      inputItems: [],
      tools: [],
      onTextDelta: (d) => void deltas.push(d),
    });
    expect(deltas.join("")).toBe("hello");
    expect(turn.text).toBe("hello");
    expect(turn.functionCalls[0].name).toBe("dock.open");
  });
});
