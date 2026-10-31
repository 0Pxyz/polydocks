import { describe, it, expect, beforeAll } from "bun:test";
import { find_capabilities } from "../server/agent/tools/find_capabilities";
import { invoke_capability } from "../server/agent/tools/invoke_capability";
import { initializeFirstPartyPlugins } from "../server/plugins/first-party";
import { runAgentLoop } from "../server/agent/loop";

describe("Agent Meta-Tools & First-Party Plugin Orchestration", () => {
  beforeAll(() => {
    initializeFirstPartyPlugins();
  });

  describe("find_capabilities Meta-Tool", () => {
    it("discovers search capabilities based on keyword query", async () => {
      const res = (await find_capabilities.execute(
        { query: "search web papers", limit: 5 },
        { workspaceId: "test-ws", step: 1 }
      )) as any;

      expect(res.found).toBeGreaterThan(0);
      expect(Array.isArray(res.capabilities)).toBe(true);
      const capIds = res.capabilities.map((c: any) => c.id);
      expect(capIds).toContain("search.web");
    });

    it("discovers sources and sandbox capabilities", async () => {
      const res = (await find_capabilities.execute(
        { query: "sources list sandbox", limit: 5 },
        { workspaceId: "test-ws", step: 1 }
      )) as any;

      expect(res.found).toBeGreaterThan(0);
      const capIds = res.capabilities.map((c: any) => c.id);
      expect(capIds.some((id: string) => id.startsWith("sources.") || id.startsWith("sandbox."))).toBe(true);
    });

    it("returns empty matches when query has no matching terms", async () => {
      const res = (await find_capabilities.execute(
        { query: "xyznonexistentcapability12345", limit: 5 },
        { workspaceId: "test-ws", step: 1 }
      )) as any;

      expect(res.found).toBe(0);
      expect(res.capabilities.length).toBe(0);
    });
  });

  describe("invoke_capability Meta-Tool", () => {
    it("invokes first-party sources capability successfully via the bus", async () => {
      const res = (await invoke_capability.execute(
        {
          id: "sources.list",
          input: { workspaceId: "test-ws-meta" },
        },
        { workspaceId: "test-ws-meta", step: 1 }
      )) as any;

      expect(res.success).toBe(true);
      expect(res.capabilityId).toBe("sources.list");
      expect(res.pluginId).toBe("sources");
      expect(res.data).toBeDefined();
    });

    it("returns an error payload when capability does not exist", async () => {
      const res = (await invoke_capability.execute(
        {
          id: "nonexistent.tool",
          input: {},
        },
        { workspaceId: "test-ws-meta", step: 1 }
      )) as any;

      expect(res.error).toBeDefined();
      expect(res.error).toContain("not found");
    });
  });

  describe("Progressive Disclosure & Manifest-Driven Skill Injection", () => {
    it("injects installed plugins summary and manifest skill into system prompt", async () => {
      let capturedSystemPrompt = "";

      const mockLlm = {
        chat: {
          completions: {
            create: async (params: any) => {
              const systemMsg = params.messages.find((m: any) => m.role === "system");
              if (systemMsg) {
                capturedSystemPrompt = systemMsg.content;
              }
              return {
                choices: [
                  {
                    message: {
                      role: "assistant",
                      content: "Done.",
                    },
                  },
                ],
              };
            },
          },
        },
      } as any;

      await runAgentLoop({
        prompt: "pesquise as principais fontes sobre física quântica",
        llmClient: mockLlm,
      });

      // 1. Verify installed plugins list appears in prompt
      expect(capturedSystemPrompt).toContain("Installed Plugins");
      expect(capturedSystemPrompt).toContain("search");
      expect(capturedSystemPrompt).toContain("workspace");

      // 2. Verify intent-selected research skill is injected
      expect(capturedSystemPrompt).toContain("Specialized Skill: content-and-reader");
      expect(capturedSystemPrompt).toContain("search_web");
    });
  });
});
