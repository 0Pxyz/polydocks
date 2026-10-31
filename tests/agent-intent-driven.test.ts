import { describe, it, expect } from "bun:test";
import { runAgentLoop, type AgentStepEvent } from "../server/agent/loop";
import { fullTools } from "../server/agent/tools";
import { getFriendlyToolStatus } from "../src/lib/agent/events";

describe("Intent-Driven Context-Aware Agent Execution Policy (Issue #90)", () => {
  it("Scenario A: answers general greetings directly with zero tool calls or scope assumptions", async () => {
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

    // Verify the principle-based prompt keeps workspace-default and no-unsolicited-inspection rules
    expect(capturedSystemPrompt).toContain("Answer in place");
    expect(capturedSystemPrompt).toContain("direct answers with no tools");
    expect(capturedSystemPrompt).toContain("Never run unsolicited inspections");
    expect(capturedSystemPrompt).not.toContain("Workspace Scope");

    // Zero tool calls emitted
    const toolEvents = emittedEvents.filter((ev) => ev.type === "tool.start");
    expect(toolEvents.length).toBe(0);
  });

  it("Scenario B: explains conceptual topics without creating anything or assuming scope", async () => {
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
    expect(capturedSystemPrompt).not.toContain("Workspace Scope");

    // No creation or unsolicited tool executions
    const toolCalls = emittedEvents.filter((ev) => ev.type === "tool.start");
    expect(toolCalls.length).toBe(0);
  });

  it("Scenario C: creates a plugin only when explicitly requested", async () => {
    const emittedEvents: AgentStepEvent[] = [];
    let stepCount = 0;
    const pluginId = `test-issue90-plugin-${Date.now().toString(36)}`;
    const mockLlm: any = {
      chat: {
        completions: {
          create: async (params: any) => {
            stepCount += 1;
            if (stepCount === 1) {
              return {
                choices: [
                  {
                    message: {
                      role: "assistant",
                      tool_calls: [
                        {
                          id: "call_create_1",
                          type: "function",
                          function: {
                            name: "create_plugin",
                            arguments: JSON.stringify({
                              id: pluginId,
                              name: "Issue90 Plugin",
                              description: "Created on explicit request",
                              userApproved: true,
                              code: "const app = document.getElementById(\"app\"); if (app) app.textContent = \"hi\";",
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
              choices: [{ message: { role: "assistant", content: "Plugin mounted." } }],
            };
          },
        },
      },
    };

    const result = await runAgentLoop({
      prompt: "Build me a small plugin.",
      tools: fullTools,
      llmClient: mockLlm,
      onEvent: (ev) => {
        emittedEvents.push(ev);
      },
    });

    expect(result.status).toBe("completed");
    const toolStarts = emittedEvents.filter((ev) => ev.type === "tool.start");
    expect(toolStarts.length).toBe(1);
    expect(toolStarts[0].payload?.name).toBe("create_plugin");
    const createdEvents = emittedEvents.filter((ev) => ev.type === "plugin.created");
    expect(createdEvents.length).toBe(1);
    const { db: tdb } = await import("../server/workspace/db");
    tdb.query("DELETE FROM plugin_files WHERE plugin_id = ?").run(pluginId);
    tdb.query("DELETE FROM plugins WHERE id = ?").run(pluginId);
    tdb.query("DELETE FROM workspace_plugins WHERE plugin_id = ?").run(pluginId);
    tdb.query("DELETE FROM plugin_versions WHERE plugin_id = ?").run(pluginId);
  });


  it("Scenario E: researches and writes workspace note directly", async () => {
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
      tools: fullTools,
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
      'Searching the web via TinyFish for "agentic coding developments"…'
    );
    expect(getFriendlyToolStatus("write_file")).toBe("Writing your notes…");
  });

  it("silences trivial bookkeeping and internal inspection tools from noisy UI status updates", () => {
    const trivialTools = [
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
});
