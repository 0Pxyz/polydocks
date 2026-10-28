import { describe, expect, it } from "bun:test";
import { z } from "zod";
import { runAgentLoop, type AgentStepEvent } from "./loop";
import type { AgentTool } from "./tools/types";

describe("Agent Loop & Tool Orchestration Engine", () => {
  it("should complete with text answer when model makes no tool calls", async () => {
    const events: AgentStepEvent[] = [];

    const mockLlmClient: any = {
      chat: {
        completions: {
          create: async () => ({
            choices: [
              {
                message: {
                  role: "assistant",
                  content: "Welcome to Polymax! You are currently exploring Quantum Computing.",
                },
              },
            ],
          }),
        },
      },
    };

    const result = await runAgentLoop({
      prompt: "Where am I?",
      cityId: "quantum-computing",
      llmClient: mockLlmClient,
      onEvent: (event) => events.push(event),
    });

    expect(result.status).toBe("completed");
    expect(result.text).toContain("Quantum Computing");
    expect(result.steps).toBe(1);

    expect(events.map((e) => e.type)).toEqual(["agent.start", "agent.finish"]);
    expect(events[1].payload?.text).toContain("Quantum Computing");
  });

  it("should execute tool calls, return results, and continue loop to completion", async () => {
    const events: AgentStepEvent[] = [];
    let callCount = 0;

    const mockTool: AgentTool<{ topic: string }> = {
      name: "search_topic",
      description: "Search for a topic",
      schema: z.object({ topic: z.string() }),
      execute: async (args) => {
        return { hits: [`Result for ${args.topic}`] };
      },
    };

    const mockLlmClient: any = {
      chat: {
        completions: {
          create: async () => {
            callCount++;
            if (callCount === 1) {
              return {
                choices: [
                  {
                    message: {
                      role: "assistant",
                      tool_calls: [
                        {
                          id: "call_abc123",
                          type: "function",
                          function: {
                            name: "search_topic",
                            arguments: JSON.stringify({ topic: "Superposition" }),
                          },
                        },
                      ],
                    },
                  },
                ],
              };
            }

            // Second step: assistant generates final text
            return {
              choices: [
                {
                  message: {
                    role: "assistant",
                    content: "Found 1 result for Superposition.",
                  },
                },
              ],
            };
          },
        },
      },
    };

    const result = await runAgentLoop({
      prompt: "Search about Superposition",
      tools: [mockTool],
      llmClient: mockLlmClient,
      onEvent: (event) => events.push(event),
    });

    expect(result.status).toBe("completed");
    expect(result.steps).toBe(2);
    expect(callCount).toBe(2);

    const eventTypes = events.map((e) => e.type);
    expect(eventTypes).toEqual(["agent.start", "tool.start", "tool.done", "agent.finish"]);
    expect(events[1].payload?.name).toBe("search_topic");
  });

  it("should retry with error feedback when tool arguments fail Zod validation", async () => {
    const events: AgentStepEvent[] = [];
    let callCount = 0;

    const mockTool: AgentTool<{ count: number }> = {
      name: "generate_cards",
      description: "Generate flashcards",
      schema: z.object({ count: z.number().int().positive() }),
      execute: async (args) => ({ generated: args.count }),
    };

    const mockLlmClient: any = {
      chat: {
        completions: {
          create: async () => {
            callCount++;
            if (callCount === 1) {
              // First call: passes invalid string instead of number
              return {
                choices: [
                  {
                    message: {
                      role: "assistant",
                      tool_calls: [
                        {
                          id: "call_bad_args",
                          type: "function",
                          function: {
                            name: "generate_cards",
                            arguments: JSON.stringify({ count: "not-a-number" }),
                          },
                        },
                      ],
                    },
                  },
                ],
              };
            }

            // Second call: model corrects arguments
            return {
              choices: [
                {
                  message: {
                    role: "assistant",
                    content: "Flashcards successfully generated after retry.",
                  },
                },
              ],
            };
          },
        },
      },
    };

    const result = await runAgentLoop({
      prompt: "Generate 5 cards",
      tools: [mockTool],
      llmClient: mockLlmClient,
      onEvent: (event) => events.push(event),
    });

    expect(result.status).toBe("completed");
    expect(events.some((e) => e.type === "tool.done")).toBe(true);
    const toolDoneEvent = events.find((e) => e.type === "tool.done");
    expect((toolDoneEvent?.payload?.result as any)?.error).toContain("Invalid arguments");
  });

  it("should halt gracefully when max steps limit is reached", async () => {
    const events: AgentStepEvent[] = [];

    const mockLlmClient: any = {
      chat: {
        completions: {
          create: async () => ({
            choices: [
              {
                message: {
                  role: "assistant",
                  tool_calls: [
                    {
                      id: "infinite_call",
                      type: "function",
                      function: {
                        name: "dummy_tool",
                        arguments: "{}",
                      },
                    },
                  ],
                },
              },
            ],
          }),
        },
      },
    };

    const result = await runAgentLoop({
      prompt: "Loop forever",
      maxSteps: 3,
      llmClient: mockLlmClient,
      onEvent: (event) => events.push(event),
    });

    expect(result.status).toBe("max_steps_reached");
    expect(result.steps).toBe(3);
    expect(events[events.length - 1].type).toBe("agent.finish");
    expect(result.text).not.toContain("Reached maximum limit");
  });

  it("should synthesize graceful summary upon max steps exhaustion", async () => {
    const events: AgentStepEvent[] = [];
    let callCount = 0;

    const mockLlmClient: any = {
      chat: {
        completions: {
          create: async (params: any) => {
            callCount++;
            // During regular steps: loop tools
            if (callCount <= 2) {
              return {
                choices: [
                  {
                    message: {
                      role: "assistant",
                      tool_calls: [
                        {
                          id: `call_${callCount}`,
                          type: "function",
                          function: {
                            name: "dummy_tool",
                            arguments: "{}",
                          },
                        },
                      ],
                    },
                  },
                ],
              };
            }

            // Fallback synthesis step (no tools)
            expect(params.tools).toBeUndefined();
            return {
              choices: [
                {
                  message: {
                    role: "assistant",
                    content: "Synthesized overview of newly founded territory with immediate next steps.",
                  },
                },
              ],
            };
          },
        },
      },
    };

    const result = await runAgentLoop({
      prompt: "Research deep topic",
      maxSteps: 2,
      llmClient: mockLlmClient,
      onEvent: (event) => events.push(event),
    });

    expect(result.status).toBe("max_steps_reached");
    expect(result.text).toBe("Synthesized overview of newly founded territory with immediate next steps.");
    expect(events[events.length - 1].payload?.text).toBe(
      "Synthesized overview of newly founded territory with immediate next steps."
    );
  });

  it("should emit map.changed when plan_map is executed", async () => {
    const events: AgentStepEvent[] = [];
    let callCount = 0;

    const mockLlmClient: any = {
      chat: {
        completions: {
          create: async () => {
            callCount++;
            if (callCount === 1) {
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
                            arguments: JSON.stringify({ interests: ["Neuroscience"] }),
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
                    content: "Neuroscience region charted on the world map.",
                  },
                },
              ],
            };
          },
        },
      },
    };

    const result = await runAgentLoop({
      prompt: "Add Neuroscience to the world map",
      llmClient: mockLlmClient,
      onEvent: (event) => events.push(event),
    });

    expect(result.status).toBe("completed");
    const mapChangedEvent = events.find((e) => e.type === "map.changed");
    expect(mapChangedEvent).toBeDefined();
    expect((mapChangedEvent?.payload as any)?.spec?.regions?.some((r: any) => r.title === "Neuroscience")).toBe(true);
  });

  it("should catch errors and emit error event", async () => {
    const events: AgentStepEvent[] = [];

    const mockLlmClient: any = {
      chat: {
        completions: {
          create: async () => {
            throw new Error("Meta API rate limit exceeded");
          },
        },
      },
    };

    const result = await runAgentLoop({
      prompt: "Do work",
      llmClient: mockLlmClient,
      onEvent: (event) => events.push(event),
    });

    expect(result.status).toBe("error");
    expect(result.error).toBe("Meta API rate limit exceeded");
    expect(events.some((e) => e.type === "error")).toBe(true);
  });

  it("should map upstream 401 Unauthorized to typed model_unauthorized event with no secrets leaked", async () => {
    const events: AgentStepEvent[] = [];
    const SECRET_KEY = "sk-meta-supersecret-token-123456";

    const mockLlmClient: any = {
      chat: {
        completions: {
          create: async () => {
            const authError: any = new Error(
              `401 Unauthorized: Invalid API key '${SECRET_KEY}' passed in Authorization header`
            );
            authError.status = 401;
            authError.name = "AuthenticationError";
            throw authError;
          },
        },
      },
    };

    const result = await runAgentLoop({
      prompt: "Hello",
      llmClient: mockLlmClient,
      onEvent: (event) => events.push(event),
    });

    expect(result.status).toBe("error");
    expect(result.error).toBe("model_unauthorized");

    const errEvent = events.find((e) => e.type === "error");
    expect(errEvent).toBeDefined();
    expect(errEvent?.payload?.code).toBe("model_unauthorized");
    expect(errEvent?.payload?.message).toBe("Model access isn't set up. Check your API key.");

    // Critical security check: Ensure raw secret key is never leaked
    const fullPayloadString = JSON.stringify(events);
    expect(fullPayloadString).not.toContain(SECRET_KEY);
    expect(fullPayloadString).not.toContain("Authorization");
  });
});
