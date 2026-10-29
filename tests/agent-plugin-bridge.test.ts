import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { z } from "zod";
import { runAgentLoop, type AgentStepEvent } from "../server/agent/loop";
import { listSessions } from "../server/agent/taskRunner";
import { clearAgentThread } from "../server/workspace/thread";
import {
  adaptBackendEvent,
  getFriendlyToolStatus,
} from "../src/lib/agent/events";

const BRIDGE_USER = "plugin_bridge_test_user";

function countSessions(): number {
  return listSessions().length;
}

function mockLlmWithToolCall(toolName: string, args: Record<string, unknown>) {
  let calls = 0;
  return {
    chat: {
      completions: {
        create: async () => {
          calls++;
          if (calls === 1) {
            return {
              choices: [
                {
                  message: {
                    role: "assistant",
                    tool_calls: [
                      {
                        id: `call_${toolName}_1`,
                        type: "function",
                        function: { name: toolName, arguments: JSON.stringify(args) },
                      },
                    ],
                  },
                },
              ],
            };
          }
          return {
            choices: [{ message: { role: "assistant", content: "Done." } }],
          };
        },
      },
    },
  } as any;
}

const stubCreatePlugin: any = {
  name: "create_plugin",
  description: "stub",
  schema: z.object({}).passthrough(),
  execute: async (_args: any) => ({
    success: true,
    pluginId: "pomodoro-timer",
    name: "Pomodoro Timer",
    workspaceId: "default",
    version: "1.0.0",
  }),
};

describe("Backend leak fixes (#113)", () => {
  beforeEach(() => {
    clearAgentThread(BRIDGE_USER);
  });

  afterEach(() => {
    clearAgentThread(BRIDGE_USER);
  });

  it("interactive thread runs mint no sessions; explicit session runs still do", async () => {
    const mockLlm: any = {
      chat: {
        completions: {
          create: async () => ({
            choices: [{ message: { role: "assistant", content: "Hi." } }],
          }),
        },
      },
    };

    const before = countSessions();
    await runAgentLoop({
      prompt: "Hello",
      userId: BRIDGE_USER,
      llmClient: mockLlm,
      onEvent: () => {},
    });
    expect(countSessions()).toBe(before);

    const sessionId = `test_bridge_sess_${Date.now()}`;
    await runAgentLoop({
      prompt: "Hello",
      sessionId,
      llmClient: mockLlm,
      onEvent: () => {},
    });
    expect(countSessions()).toBe(before + 1);
  });

  it("emits plugin.created when create_plugin succeeds", async () => {
    const events: AgentStepEvent[] = [];
    await runAgentLoop({
      prompt: "Build me a pomodoro timer",
      userId: BRIDGE_USER,
      tools: [stubCreatePlugin],
      llmClient: mockLlmWithToolCall("create_plugin", { id: "pomodoro-timer" }),
      onEvent: (ev) => {
        events.push(ev);
      },
    });

    const created = events.find((e) => e.type === "plugin.created");
    expect(created).toBeDefined();
    expect((created?.payload as any)?.pluginId).toBe("pomodoro-timer");
  });

  it("adapts plugin events to UI events the dock can mount", () => {
    const created = adaptBackendEvent({
      type: "plugin.created",
      step: 1,
      payload: { pluginId: "pomodoro-timer", name: "Pomodoro Timer", workspaceId: "default" },
    });
    expect(created?.type).toBe("plugin.created");
    if (created?.type === "plugin.created") {
      expect(created.plugin.id).toBe("pomodoro-timer");
      expect(created.workspaceId).toBe("default");
    }

    const published = adaptBackendEvent({
      type: "plugin.published",
      step: 2,
      payload: { pluginId: "pomodoro-timer", name: "Pomodoro Timer" },
    });
    expect(published?.type).toBe("plugin.published");

    const operated = adaptBackendEvent({
      type: "plugin.operated",
      step: 3,
      payload: { pluginId: "pomodoro-timer", action: "start" },
    });
    expect(operated?.type).toBe("plugin.operated");
  });

  it("gives plugin tools visible status labels instead of silence", () => {
    expect(getFriendlyToolStatus("create_plugin", { name: "Pomodoro" })).toContain("Pomodoro");
    expect(getFriendlyToolStatus("modify_plugin", {})).toBe("Updating the tool…");
    expect(getFriendlyToolStatus("operate_plugin", { action: "start" })).toContain("start");
    expect(getFriendlyToolStatus("publish_plugin", {})).toBe("Publishing the tool…");
    expect(getFriendlyToolStatus("promote_to_plugin", {})).toBe("Publishing the tool…");
  });
});
