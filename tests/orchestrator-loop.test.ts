import { describe, it, expect, afterEach } from "bun:test";
import {
  ORCHESTRATOR_TOOLS,
  runOrchestratorLoop,
  setHeavyRunnerForTest,
  type AgentStepEvent,
} from "../server/agent/orchestrator";

/** Orchestrator loop (#211): fast triage, direct dock verbs, escalate the rest. */
describe("orchestrator loop", () => {
  afterEach(() => setHeavyRunnerForTest());

  it("offers dock verbs plus escalate and nothing else (missed-escalation gate)", () => {
    const names = ORCHESTRATOR_TOOLS.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        "chat.toggle",
        "dock.background",
        "dock.close",
        "dock.focus",
        "dock.list",
        "dock.next",
        "dock.open",
        "dock.pin",
        "dock.prev",
        "dock.unpin",
        "escalate",
      ].sort()
    );
    // No build tools, no discovery roots, no search: the model cannot
    // act where it must escalate because the tool is not offered.
    for (const banned of ["create_plugin", "modify_plugin", "find_capabilities", "search_web", "tool_search", "invoke_capability", "read_skill"]) {
      expect(names).not.toContain(banned);
    }
    const escalateTool = ORCHESTRATOR_TOOLS.find((t) => t.name === "escalate");
    expect(escalateTool?.description).toContain("heavy agent");
  });

  it("resolves simple requests directly without touching the heavy agent", async () => {
    let heavyCalls = 0;
    setHeavyRunnerForTest(async () => ((heavyCalls++), { ok: true, text: "heavy", steps: 1, citations: [] }));
    const mockClient: any = {
      chat: {
        completions: {
          create: async (params: any) => {
            if (params.stream) {
              return {
                choices: [
                  {
                    message: {
                      role: "assistant",
                      content: null,
                      tool_calls: [
                        {
                          id: "call_orch_1",
                          type: "function",
                          function: { name: "dock.list", arguments: "{}" },
                        },
                      ],
                    },
                  },
                ],
              };
            }
            return { choices: [{ message: { role: "assistant", content: "Here is your dock." } }] };
          },
        },
      },
    };
    const result = await runOrchestratorLoop({
      prompt: "What is in my dock?",
      llmClient: mockClient,
      onEvent: () => {},
    });
    expect(result.status).toBe("completed");
    expect(heavyCalls).toBe(0);
  });

  it("escalates heavy work and relays the heavy answer", async () => {
    const seen: string[] = [];
    setHeavyRunnerForTest(async (handoff) => {
      seen.push(handoff.prompt);
      return { ok: true, text: "Heavy answer relayed.", steps: 3, citations: [] };
    });
    let calls = 0;
    const mockClient: any = {
      chat: {
        completions: {
          create: async (params: any) => {
            calls++;
            if (params.stream && calls === 1) {
              return {
                choices: [
                  {
                    message: {
                      role: "assistant",
                      content: null,
                      tool_calls: [
                        {
                          id: "call_orch_esc",
                          type: "function",
                          function: {
                            name: "escalate",
                            arguments: JSON.stringify({ prompt: "Build a habit tracker" }),
                          },
                        },
                      ],
                    },
                  },
                ],
              };
            }
            return { choices: [{ message: { role: "assistant", content: "Relayed." } }] };
          },
        },
      },
    };
    const events: AgentStepEvent[] = [];
    const result = await runOrchestratorLoop({
      prompt: "Build me a habit tracker",
      workspaceId: "ws-1",
      llmClient: mockClient,
      onEvent: (e) => void events.push(e),
    });
    expect(result.status).toBe("completed");
    expect(seen).toEqual(["Build a habit tracker"]);
    expect(events.some((e) => e.type === "tool.start" && (e.payload as any)?.name === "escalate")).toBe(true);
  });

  it("uses the orchestrator prompt file", async () => {
    const { getPrompt, resetMainPromptCache } = await import("../server/agent/prompts/index");
    resetMainPromptCache();
    const { text, version } = getPrompt("orchestrator");
    expect(version).toBeGreaterThanOrEqual(1);
    expect(text).toContain("escalate");
    expect(text).toContain("dock verb");
  });
});
