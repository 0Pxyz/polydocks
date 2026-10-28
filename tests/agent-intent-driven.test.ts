import { describe, it, expect } from "vitest";
import { runAgentLoop, type AgentStepEvent } from "../server/agent/loop";
import { defaultTools } from "../server/agent/tools";
import { getFriendlyToolStatus } from "../src/lib/agent/events";

describe("Intent-Driven Context-Aware Agent Execution Policy (Issue #90)", () => {
  it("Scenario A: answers general greetings directly with zero tool calls or city assumptions", async () => {
    let capturedSystemPrompt = "";
    const emittedEvents: AgentStepEvent[] = [];

    const mockLlm: any = {
      chat: {
        completions: {
          create: async (params: any) => {
            const sys = params.messages.find((m: any) => m.role === "system");
            capturedSystemPrompt = sys?.content || "";
            return {
              choices: [
                {
                  message: {
                    role: "assistant",
                    content: "Hey! How can I help you in your workspace today?",
                  },
                },
              ],
            };
          },
        },
      },
    };

    const result = await runAgentLoop({
      prompt: "Hey",
      llmClient: mockLlm,
      onEvent: (ev) => {
        emittedEvents.push(ev);
      },
    });

    expect(result.status).toBe("completed");
    expect(result.text).toBe("Hey! How can I help you in your workspace today?");

    // Verify system prompt enforces workspace as default and forbids unsolicited city assumptions
    expect(capturedSystemPrompt).toContain("Workspace as Default (Intent-Driven)");
    expect(capturedSystemPrompt).toContain("General conversation, greetings, and explanations");
    expect(capturedSystemPrompt).toContain("Zero Unsolicited Inspections");
    expect(capturedSystemPrompt).not.toContain("Active City Workspace Scope");

    // Zero tool calls emitted
    const toolEvents = emittedEvents.filter((ev) => ev.type === "tool.start");
    expect(toolEvents.length).toBe(0);
  });

  it("Scenario B: explains conceptual topics without creating a city or assuming active city", async () => {
    let capturedSystemPrompt = "";
    const emittedEvents: AgentStepEvent[] = [];

    const mockLlm: any = {
      chat: {
        completions: {
          create: async (params: any) => {
            const sys = params.messages.find((m: any) => m.role === "system");
            capturedSystemPrompt = sys?.content || "";
            return {
              choices: [
                {
                  message: {
                    role: "assistant",
                    content:
                      "Transformers rely on the self-attention mechanism to process sequences in parallel, computing dynamic query-key-value relationships across tokens.",
                  },
                },
              ],
            };
          },
        },
      },
    };

    const result = await runAgentLoop({
      prompt: "Explain how transformers work.",
      llmClient: mockLlm,
      onEvent: (ev) => {
        emittedEvents.push(ev);
      },
    });

    expect(result.status).toBe("completed");
    expect(result.text).toContain("self-attention");
    expect(capturedSystemPrompt).not.toContain("Active City Workspace Scope");

    // No city creation or unsolicited tool executions
    const toolCalls = emittedEvents.filter((ev) => ev.type === "tool.start");
    expect(toolCalls.length).toBe(0);
  });

  it("Scenario C: triggers Knowledge City creation tools only when explicitly requested", async () => {
    let capturedSystemPrompt = "";
    const emittedEvents: AgentStepEvent[] = [];
    let stepCount = 0;

    const mockLlm: any = {
      chat: {
        completions: {
          create: async (params: any) => {
            const sys = params.messages.find((m: any) => m.role === "system");
            capturedSystemPrompt = sys?.content || "";
            stepCount++;

            if (stepCount === 1) {
              return {
                choices: [
                  {
                    message: {
                      role: "assistant",
                      tool_calls: [
                        {
                          id: "call_plan_1",
                          type: "function",
                          function: {
                            name: "plan_map",
                            arguments: JSON.stringify({ interests: ["Neural Networks"] }),
                          },
                        },
                      ],
                    },
                  },
                ],
              };
            }

            return {
              choices: [
                {
                  message: {
                    role: "assistant",
                    content: "Created Neural Networks knowledge territory and mapped foundational cities.",
                  },
                },
              ],
            };
          },
        },
      },
    };

    const result = await runAgentLoop({
      prompt: "Create a Knowledge City to learn neural networks from scratch.",
      tools: defaultTools,
      llmClient: mockLlm,
      onEvent: (ev) => {
        emittedEvents.push(ev);
      },
    });

    expect(result.status).toBe("completed");
    expect(capturedSystemPrompt).toContain("Specialized Skill: Knowledge Territories & World Map Planning");

    const toolStarts = emittedEvents.filter((ev) => ev.type === "tool.start");
    expect(toolStarts.length).toBe(1);
    expect(toolStarts[0].payload?.name).toBe("plan_map");

    // Map changed event should be emitted
    const mapEvents = emittedEvents.filter((ev) => ev.type === "map.changed");
    expect(mapEvents.length).toBe(1);
  });

  it("Scenario D: opens specific requested experience without inspecting unrelated tools", async () => {
    let stepCount = 0;
    const executedTools: string[] = [];

    const mockLlm: any = {
      chat: {
        completions: {
          create: async () => {
            stepCount++;
            if (stepCount === 1) {
              return {
                choices: [
                  {
                    message: {
                      role: "assistant",
                      tool_calls: [
                        {
                          id: "call_open_1",
                          type: "function",
                          function: {
                            name: "open_tab",
                            arguments: JSON.stringify({ tabId: "browser" }),
                          },
                        },
                      ],
                    },
                  },
                ],
              };
            }
            return {
              choices: [
                {
                  message: {
                    role: "assistant",
                    content: "Opened Browser in the workspace tray.",
                  },
                },
              ],
            };
          },
        },
      },
    };

    const result = await runAgentLoop({
      prompt: "Open Browser.",
      tools: defaultTools,
      llmClient: mockLlm,
      onEvent: (ev) => {
        if (ev.type === "tool.start") {
          executedTools.push(String(ev.payload?.name));
        }
      },
    });

    expect(result.status).toBe("completed");
    expect(executedTools).toEqual(["open_tab"]);
    expect(executedTools).not.toContain("list_tabs");
    expect(executedTools).not.toContain("inspect_tab");
    expect(executedTools).not.toContain("get_city_context");
  });

  it("Scenario E: researches and writes workspace note directly without requiring a city", async () => {
    let stepCount = 0;
    const executedTools: string[] = [];

    const mockLlm: any = {
      chat: {
        completions: {
          create: async () => {
            stepCount++;
            if (stepCount === 1) {
              return {
                choices: [
                  {
                    message: {
                      role: "assistant",
                      tool_calls: [
                        {
                          id: "call_search_1",
                          type: "function",
                          function: {
                            name: "search_web",
                            arguments: JSON.stringify({ query: "agentic coding developments 2026" }),
                          },
                        },
                      ],
                    },
                  },
                ],
              };
            }
            if (stepCount === 2) {
              return {
                choices: [
                  {
                    message: {
                      role: "assistant",
                      tool_calls: [
                        {
                          id: "call_write_1",
                          type: "function",
                          function: {
                            name: "write_file",
                            arguments: JSON.stringify({
                              path: "notes/agentic-coding.md",
                              content: "# Agentic Coding Developments\n\n- Autonomous tool synthesis\n- Persistent memory",
                            }),
                          },
                        },
                      ],
                    },
                  },
                ],
              };
            }
            return {
              choices: [
                {
                  message: {
                    role: "assistant",
                    content: "Researched latest agentic coding findings and documented them in notes/agentic-coding.md.",
                  },
                },
              ],
            };
          },
        },
      },
    };

    const result = await runAgentLoop({
      prompt: "Research the latest developments in agentic coding and summarize the findings in a Markdown note.",
      tools: defaultTools,
      llmClient: mockLlm,
      onEvent: (ev) => {
        if (ev.type === "tool.start") {
          executedTools.push(String(ev.payload?.name));
        }
      },
    });

    expect(result.status).toBe("completed");
    expect(executedTools).toEqual(["search_web", "write_file"]);

    // Verify friendly status mapping for these substantive tools
    expect(getFriendlyToolStatus("search_web", { query: "agentic coding developments" })).toBe(
      'Searching the web for "agentic coding developments"…'
    );
    expect(getFriendlyToolStatus("write_file")).toBe("Writing your notes…");
  });

  it("silences trivial bookkeeping and internal inspection tools from noisy UI status updates", () => {
    const trivialTools = [
      "list_tabs",
      "inspect_tab",
      "get_city_context",
      "close_tray",
      "list_maps",
      "set_map",
      "place_city",
      "find_capabilities",
      "invoke_capability",
      "inspect_experience",
      "inspect_execution",
      "list_recent_executions",
      "list_files",
      "search_files",
      "recall_memory",
      "record_memory",
    ];

    for (const tool of trivialTools) {
      expect(getFriendlyToolStatus(tool)).toBeNull();
    }
  });

  it("scopes context when cityId is explicitly provided without forcing unsolicited city dumps", async () => {
    let capturedSystemPrompt = "";

    const mockLlm: any = {
      chat: {
        completions: {
          create: async (params: any) => {
            const sys = params.messages.find((m: any) => m.role === "system");
            capturedSystemPrompt = sys?.content || "";
            return {
              choices: [
                {
                  message: {
                    role: "assistant",
                    content: "Athens workspace is ready for your questions.",
                  },
                },
              ],
            };
          },
        },
      },
    };

    const result = await runAgentLoop({
      prompt: "Hello from Athens",
      cityId: "athens",
      llmClient: mockLlm,
    });

    expect(result.status).toBe("completed");
    expect(capturedSystemPrompt).toContain('Active City Workspace Scope: "athens"');
    expect(capturedSystemPrompt).toContain("Operate within this city only when the user's request pertains to it");
  });
});
