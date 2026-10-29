import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "os";
import { z } from "zod";
import { runAgentLoop, type AgentStepEvent } from "../server/agent/loop";
import {
  getSession,
  createSession,
  getTask,
  createTask,
  readSessionTranscript,
  TaskExecutionEngine,
} from "../server/agent/taskRunner";
import { initAgentHome } from "../server/system/agentHome";
import type { AgentTool } from "../server/agent/tools/types";

describe("Session-Aware Agent Loop & Task Dispatch (Issue #79)", () => {
  let tmpDir: string;
  const originalEnv = process.env.AGENT_HOME_DIR;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-loop-sessions-test-"));
    process.env.AGENT_HOME_DIR = tmpDir;
    await initAgentHome(tmpDir);
  });

  afterEach(async () => {
    if (originalEnv) {
      process.env.AGENT_HOME_DIR = originalEnv;
    } else {
      delete process.env.AGENT_HOME_DIR;
    }
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  it("persists event stream to agent-home/sessions/<sessionId>.jsonl and creates session", async () => {
    const sessionId = `test_sess_${Date.now()}`;
    const emittedEvents: AgentStepEvent[] = [];

    const mockLlm: any = {
      chat: {
        completions: {
          create: async () => ({
            choices: [
              {
                message: {
                  role: "assistant",
                  content: "I have successfully analyzed the topic.",
                },
              },
            ],
          }),
        },
      },
    };

    const result = await runAgentLoop({
      prompt: "Analyze Stoic virtue",
      sessionId,
      workspaceId: "ws-test",
      llmClient: mockLlm,
      onEvent: (ev) => {
        emittedEvents.push(ev);
      },
    });

    expect(result.status).toBe("completed");
    expect(result.text).toBe("I have successfully analyzed the topic.");

    // Check that session was created in SQLite
    const session = getSession(sessionId);
    expect(session).not.toBeNull();
    expect(session?.workspaceId).toBe("ws-test");

    // Check that events were emitted
    expect(emittedEvents.length).toBeGreaterThanOrEqual(2);
    expect(emittedEvents[0].type).toBe("agent.start");
    expect(emittedEvents[emittedEvents.length - 1].type).toBe("agent.finish");

    // Check that transcript JSONL exists and contains the events
    const transcript = await readSessionTranscript(sessionId, { rootDir: tmpDir });
    expect(transcript.length).toBeGreaterThanOrEqual(2);
    expect(transcript[0].type).toBe("agent.start");
    expect(transcript[transcript.length - 1].type).toBe("agent.finish");
  });

  it("tracks task state transitions and progress in SQLite when taskId is provided", async () => {
    const sessionId = `test_sess_${Date.now()}`;
    createSession({ id: sessionId, workspaceId: "ws-task-test" });

    const task = createTask({
      sessionId,
      workspaceId: "ws-task-test",
      input: { prompt: "Run research task" },
    });

    const mockLlm: any = {
      chat: {
        completions: {
          create: async () => ({
            choices: [
              {
                message: {
                  role: "assistant",
                  content: "Research finished.",
                },
              },
            ],
          }),
        },
      },
    };

    const result = await runAgentLoop({
      prompt: "Run research task",
      sessionId,
      workspaceId: "ws-task-test",
      taskId: task.id,
      llmClient: mockLlm,
    });

    expect(result.status).toBe("completed");

    // Task in SQLite should be marked completed with progress 1.0
    const updatedTask = getTask(task.id);
    expect(updatedTask).not.toBeNull();
    expect(updatedTask?.status).toBe("completed");
    expect(updatedTask?.progress).toBe(1.0);
    expect(updatedTask?.output).toEqual({ text: "Research finished.", steps: 1 });
  });

  it("updates task to cancelled state when execution is aborted via AbortSignal", async () => {
    const sessionId = `test_sess_cancel_${Date.now()}`;
    createSession({ id: sessionId, workspaceId: "ws-cancel-test" });

    const task = createTask({
      sessionId,
      workspaceId: "ws-cancel-test",
      input: { prompt: "Long running process" },
    });

    const controller = new AbortController();

    const mockLlm: any = {
      chat: {
        completions: {
          create: async () => {
            // Abort during execution
            controller.abort();
            const err = new Error("Aborted");
            err.name = "AbortError";
            throw err;
          },
        },
      },
    };

    const result = await runAgentLoop({
      prompt: "Long running process",
      sessionId,
      workspaceId: "ws-cancel-test",
      taskId: task.id,
      signal: controller.signal,
      llmClient: mockLlm,
    });

    expect(result.status).toBe("error");
    expect(result.error).toBe("Execution cancelled");

    const updatedTask = getTask(task.id);
    expect(updatedTask?.status).toBe("cancelled");
  });

  it("passes sessionId, workspaceId, and taskId to tool execution context", async () => {
    const sessionId = `test_sess_ctx_${Date.now()}`;
    const workspaceId = "ws-custom-ctx";
    createSession({ id: sessionId, workspaceId });

    const task = createTask({
      sessionId,
      workspaceId,
      input: { prompt: "Test tool context" },
    });

    let capturedCtx: any = null;

    const testTool: AgentTool = {
      name: "custom_echo",
      description: "Echoes input and records execution context",
      schema: z.object({ value: z.string() }),
      execute: async (args, ctx) => {
        capturedCtx = ctx;
        return { echoed: args.value };
      },
    };

    let stepCount = 0;
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
                          id: "call_echo_1",
                          type: "function",
                          function: {
                            name: "custom_echo",
                            arguments: JSON.stringify({ value: "hello" }),
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
                    content: "Echo completed.",
                  },
                },
              ],
            };
          },
        },
      },
    };

    const result = await runAgentLoop({
      prompt: "Test tool context",
      sessionId,
      workspaceId,
      taskId: task.id,
      tools: [testTool],
      llmClient: mockLlm,
    });

    expect(result.status).toBe("completed");
    expect(capturedCtx).not.toBeNull();
    expect(capturedCtx.sessionId).toBe(sessionId);
    expect(capturedCtx.workspaceId).toBe(workspaceId);
    expect(capturedCtx.taskId).toBe(task.id);
  });

  it("injects AGENTS.md, USER.md, and untrusted web content boundary notice into system prompt", async () => {
    let capturedSystemPrompt = "";

    const mockLlm: any = {
      chat: {
        completions: {
          create: async (params: any) => {
            const systemMsg = params.messages.find((m: any) => m.role === "system");
            capturedSystemPrompt = systemMsg?.content || "";
            return {
              choices: [
                {
                  message: {
                    role: "assistant",
                    content: "Guidelines verified.",
                  },
                },
              ],
            };
          },
        },
      },
    };

    await runAgentLoop({
      prompt: "Verify operational prompt",
      llmClient: mockLlm,
    });

    expect(capturedSystemPrompt).toContain("Operating guidelines (distilled from AGENTS.md)");
    expect(capturedSystemPrompt).toContain("User Profile & Preferences (USER.md)");
    expect(capturedSystemPrompt).toContain("Security & Untrusted Web Content Boundary");
  });

  it("dispatches task via TaskExecutionEngine.runTaskInBackground and runs loop to completion", async () => {
    const sessionId = `test_sess_bg_${Date.now()}`;
    createSession({ id: sessionId, workspaceId: "ws-bg-test" });

    const task = createTask({
      sessionId,
      workspaceId: "ws-bg-test",
      input: { prompt: "Background async task" },
    });

    // Mock LLM through config / options
    // Let's create a custom executor or run default background loop with mock
    const engine = TaskExecutionEngine.getInstance();

    const receivedEvents: AgentStepEvent[] = [];
    const unsubscribe = engine.subscribe(sessionId, (event) => {
      receivedEvents.push(event);
    });

    await engine.runTaskInBackground(task, {
      rootDir: tmpDir,
      executor: async (t, signal, emit) => {
        await emit({
          step: 1,
          type: "tool.start",
          payload: { name: "background_step" },
        });
        await emit({
          step: 2,
          type: "agent.finish",
          payload: { text: "Background worker finished." },
        });
        return { text: "Background worker finished." };
      },
    });

    // Wait briefly for background execution to complete
    await new Promise((resolve) => setTimeout(resolve, 50));

    unsubscribe();

    const updatedTask = getTask(task.id);
    expect(updatedTask?.status).toBe("completed");
    expect(updatedTask?.progress).toBe(1.0);
    expect(receivedEvents.length).toBe(2);
    expect(receivedEvents[0].type).toBe("tool.start");
    expect(receivedEvents[1].type).toBe("agent.finish");
  });
});
