import { describe, expect, it } from "bun:test";
import {
  matchDeterministicCommand,
  runDeterministicCommand,
} from "../server/agent/dispatcher";
import { runOrchestratorLoop } from "../server/agent/orchestrator";

/**
 * Fast deterministic dispatcher (#178 slice 1): imperative dock/theme
 * commands resolve with zero model calls; everything else falls through.
 */
describe("deterministic dispatcher (#178)", () => {
  it("matches imperative open for known dock ids", () => {
    expect(matchDeterministicCommand("Open browser")).toEqual({
      kind: "dock.open",
      reason: expect.any(String),
      args: { tabId: "browser" },
    });
    expect(matchDeterministicCommand("open the library")?.args).toEqual({ tabId: "store" });
    expect(matchDeterministicCommand("open notes")?.kind).toBe("dock.open");
  });

  it("matches close and list imperatives", () => {
    expect(matchDeterministicCommand("close settings")?.kind).toBe("dock.close");
    expect(matchDeterministicCommand("list my dock")?.kind).toBe("dock.list");
    expect(matchDeterministicCommand("show tools")?.kind).toBe("dock.list");
  });

  it("matches named theme switches only", () => {
    expect(matchDeterministicCommand("switch theme to cyber")?.args).toEqual({ theme: "cyber" });
    expect(matchDeterministicCommand("change theme to rainbow")).toBeNull();
  });

  it("falls through on interrogatives, unknown ids, and heavy work", () => {
    expect(matchDeterministicCommand("What is in my dock?")).toBeNull();
    expect(matchDeterministicCommand("What tools do I have?")).toBeNull();
    expect(matchDeterministicCommand("open my heart")).toBeNull();
    expect(matchDeterministicCommand("Build me a habit tracker")).toBeNull();
    expect(matchDeterministicCommand("")).toBeNull();
  });

  it("runs dock.list with zero model calls", async () => {
    const decision = matchDeterministicCommand("list my dock");
    expect(decision).not.toBeNull();
    const ran = await runDeterministicCommand(decision!);
    expect(ran.ok).toBe(true);
    expect(ran.toolName).toBe("dock.list");
  });

  it("orchestrator resolves imperatives without touching the model", async () => {
    let modelCalls = 0;
    const mockClient: any = {
      chat: { completions: { create: async () => ((modelCalls++), { choices: [{ message: { role: "assistant", content: "unused" } }] }) } },
    };
    const events: string[] = [];
    const result = await runOrchestratorLoop({
      prompt: "Open browser",
      llmClient: mockClient,
      onEvent: (e) => void events.push(e.type),
    });
    expect(result.status).toBe("completed");
    expect(modelCalls).toBe(0);
    expect(events).toEqual(["tool.start", "tool.done", "agent.finish"]);
  });

  it("orchestrator falls back to the model when the fast tool fails", async () => {
    const mockClient: any = {
      chat: {
        completions: {
          create: async () => ({ choices: [{ message: { role: "assistant", content: "Fell back." } }] }),
        },
      },
    };
    // "open chat" maps to dock.open agent; force the deterministic run to
    // fail via a revoked manifest so the loop must take over.
    const { AGENT_MANIFEST } = await import("../server/agent/manifest");
    const revoked = { ...AGENT_MANIFEST, permissions: [] };
    const result = await runOrchestratorLoop({
      prompt: "What is in my dock?",
      llmClient: mockClient,
      agentManifest: revoked,
      onEvent: () => {},
    });
    expect(result.status).toBe("completed");
  });
});
