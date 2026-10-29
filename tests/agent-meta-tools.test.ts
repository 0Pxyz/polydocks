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
        { cityId: "test-city", step: 1 }
      )) as any;

      expect(res.found).toBeGreaterThan(0);
      expect(Array.isArray(res.capabilities)).toBe(true);
      const capIds = res.capabilities.map((c: any) => c.id);
      expect(capIds).toContain("search.web");
    });

    it("discovers writing and workspace capabilities", async () => {
      const res = (await find_capabilities.execute(
        { query: "workspace note file", limit: 5 },
        { cityId: "test-city", step: 1 }
      )) as any;

      expect(res.found).toBeGreaterThan(0);
      const capIds = res.capabilities.map((c: any) => c.id);
      expect(capIds.some((id: string) => id.startsWith("writing.") || id.startsWith("workspace."))).toBe(true);
    });

    it("returns empty matches when query has no matching terms", async () => {
      const res = (await find_capabilities.execute(
        { query: "xyznonexistentcapability12345", limit: 5 },
        { cityId: "test-city", step: 1 }
      )) as any;

      expect(res.found).toBe(0);
      expect(res.capabilities.length).toBe(0);
    });
  });

  describe("invoke_capability Meta-Tool", () => {
    it("invokes first-party workspace capability successfully via the bus", async () => {
      const res = (await invoke_capability.execute(
        {
          id: "workspace.get_context",
          input: { cityId: "stoicism" },
        },
        { cityId: "stoicism", step: 1 }
      )) as any;

      expect(res.success).toBe(true);
      expect(res.capabilityId).toBe("workspace.get_context");
      expect(res.pluginId).toBe("workspace");
      expect(res.data).toBeDefined();
    });

    it("returns an error payload when capability does not exist", async () => {
      const res = (await invoke_capability.execute(
        {
          id: "nonexistent.tool",
          input: {},
        },
        { cityId: "stoicism", step: 1 }
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
