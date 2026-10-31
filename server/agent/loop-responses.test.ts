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

  it("offers namespaced tools with native search instead of find_capabilities", async () => {
    let seenTools: any[] = [];
    const mockClient: any = {
      responses: {
        create: async (params: any) => {
          seenTools = params.tools ?? [];
          return {
            id: "resp_ns",
            usage: { input_tokens: 5, output_tokens: 5 },
            output: [{ type: "message", content: [{ type: "output_text", text: "No tools needed." }] }],
          };
        },
      },
    };
    const result = await runAgentLoop({
      prompt: "Hello",
      llmClient: mockClient,
      onEvent: () => {},
    });
    expect(result.status).toBe("completed");
    const namespaces = seenTools.filter((t) => t.type === "namespace");
    expect(namespaces.length).toBeGreaterThan(0);
    for (const ns of namespaces) {
      expect(ns.tools.length).toBeLessThanOrEqual(9);
      for (const fn of ns.tools) expect(fn.defer_loading).toBe(true);
    }
    expect(seenTools.filter((t) => t.type === "tool_search")).toHaveLength(1);
    const flatNames: string[] = [];
    for (const t of seenTools) {
      if (t.type === "namespace") for (const fn of t.tools) flatNames.push(fn.name);
      else if (t.type === "function") flatNames.push(t.name);
    }
    expect(flatNames).not.toContain("find_capabilities");
    const { defaultTools } = await import("./tools/index");
    if (defaultTools.some((t) => t.name === "invoke_capability")) {
      expect(flatNames).toContain("invoke_capability");
    }
  });

  it("grounds research turns with built-in web_search and retires the custom alias", async () => {
    let seenTools: any[] = [];
    let seenInclude: any[] = [];
    const mockClient: any = {
      responses: {
        create: async (params: any) => {
          seenTools = params.tools ?? [];
          seenInclude = params.include ?? [];
          return {
            id: "resp_ws_loop",
            usage: { input_tokens: 10, output_tokens: 5 },
            output: [{ type: "message", content: [{ type: "output_text", text: "Grounded answer." }] }],
          };
        },
      },
    };
    const searchAlias: AgentTool = {
      name: "search_web",
      description: "custom search",
      schema: z.object({ query: z.string() }),
      execute: async () => ({ results: [] }),
    };
    const fetchAlias: AgentTool = {
      name: "fetch_page",
      description: "custom fetch",
      schema: z.object({ urls: z.array(z.string()) }),
      execute: async () => ({ pages: [] }),
    };
    const result = await runAgentLoop({
      prompt: "Who won the most recent Formula 1 race?",
      tools: [searchAlias, fetchAlias],
      llmClient: mockClient,
      onEvent: () => {},
    });
    expect(result.status).toBe("completed");
    const kinds = seenTools.map((t) => t.type);
    expect(kinds).toContain("web_search");
    expect(kinds).toContain("tool_search");
    const flatNames: string[] = [];
    for (const t of seenTools) {
      if (t.type === "namespace") for (const fn of t.tools) flatNames.push(fn.name);
      else if (t.type === "function") flatNames.push(t.name);
    }
    expect(flatNames).not.toContain("search_web");
    expect(seenInclude).toContain("web_search_call.results");
  });

  it("disables grounding when the intent denies research", async () => {
    let seenTools: any[] = [];
    const mockClient: any = {
      responses: {
        create: async (params: any) => {
          seenTools = params.tools ?? [];
          return {
            id: "resp_ws_theme",
            usage: { input_tokens: 10, output_tokens: 5 },
            output: [{ type: "message", content: [{ type: "output_text", text: "Theme applied." }] }],
          };
        },
      },
    };
    const result = await runAgentLoop({
      prompt: "Change my theme to dark wallpaper",
      llmClient: mockClient,
      onEvent: () => {},
    });
    expect(result.status).toBe("completed");
    expect(seenTools.map((t) => t.type)).not.toContain("web_search");
  });

  it("disables grounding on reserved-name collision and keeps the custom alias", async () => {
    let seenTools: any[] = [];
    const mockClient: any = {
      responses: {
        create: async (params: any) => {
          seenTools = params.tools ?? [];
          return {
            id: "resp_ws_denied",
            usage: { input_tokens: 10, output_tokens: 5 },
            output: [{ type: "message", content: [{ type: "output_text", text: "Theme applied." }] }],
          };
        },
      },
    };
    const searchAlias: AgentTool = {
      name: "search_web",
      description: "custom search",
      schema: z.object({ query: z.string() }),
      execute: async () => ({ results: [] }),
    };
    const collidingAlias: AgentTool = {
      name: "browser.open",
      description: "reserved-name stand-in",
      schema: z.object({ url: z.string() }),
      execute: async () => ({ ok: true }),
    };
    const result = await runAgentLoop({
      prompt: "Who won the most recent Formula 1 race?",
      tools: [searchAlias, collidingAlias],
      llmClient: mockClient,
      onEvent: () => {},
    });
    expect(result.status).toBe("completed");
    expect(seenTools.map((t) => t.type)).not.toContain("web_search");
    // Fallback: the custom alias stays namespaced so the turn keeps a route.
    const flatNames: string[] = [];
    for (const t of seenTools) {
      if (t.type === "namespace") for (const fn of t.tools) flatNames.push(fn.name);
    }
    expect(flatNames).toContain("search_web");
  });

  it("carries url_citations into the finish payload", async () => {    const events: AgentStepEvent[] = [];
    let calls = 0;
    const mockClient: any = {
      responses: {
        create: async () => {
          calls++;
          return {
            id: `resp_cite_${calls}`,
            usage: { input_tokens: 10, output_tokens: 5 },
            output: [
              { type: "web_search_call", id: "ws_c1", status: "completed" },
              {
                type: "message",
                content: [
                  {
                    type: "output_text",
                    text: "Spark launched in April.",
                    annotations: [{ type: "url_citation", url: "https://example.com/spark", title: "Spark" }],
                  },
                ],
              },
            ],
          };
        },
      },
    };
    const result = await runAgentLoop({
      prompt: "When was Muse Spark announced?",
      llmClient: mockClient,
      onEvent: (e) => events.push(e),
    });
    expect(result.status).toBe("completed");
    const finish = events.find((e) => e.type === "agent.finish");
    expect(finish?.payload?.citations).toEqual([{ url: "https://example.com/spark", title: "Spark" }]);
  });

  it("keeps the app map on demand: dock-add loads it, other turns pull via skills.read", async () => {
    let instructions = "";
    let flatNames: string[] = [];
    const mockClient: any = {
      responses: {
        create: async (params: any) => {
          instructions = params.instructions ?? "";
          flatNames = [];
          for (const t of params.tools ?? []) {
            if (t.type === "namespace") for (const fn of t.tools) flatNames.push(fn.name);
            else if (t.type === "function") flatNames.push(t.name);
          }
          return {
            id: "resp_skill_probe",
            usage: {},
            output: [{ type: "message", content: [{ type: "output_text", text: "Done." }] }],
          };
        },
      },
    };
    await runAgentLoop({ prompt: "Hello", llmClient: mockClient, onEvent: () => {} });
    expect(instructions).not.toContain("App Map");
    // The on-demand route is offered instead of the injected map.
    expect(flatNames).toContain("skills.read");

    await runAgentLoop({
      prompt: "Build me a habit tracker",
      origin: "dock-add",
      llmClient: mockClient,
      onEvent: () => {},
    });
    expect(instructions).toContain("App Map");
  });
});
