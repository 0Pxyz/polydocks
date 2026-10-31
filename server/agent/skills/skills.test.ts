import { describe, expect, it } from "bun:test";
import {
  isResearchIntent,
  isDockTabsIntent,
  isCapabilitiesIntent,
  isMemoryFilesIntent,
  isContentOpenIntent,
  isVerifyIntent,
  isPluginFixIntent,
  isPluginUpdateIntent,
  selectDomainSkills,
  stripSkillMetadata,
  skillTokens,
  loadSkill,
} from "./index";
import { runAgentLoop } from "../loop";

describe("Domain skills: plugins and dock (backend contracts)", () => {
  it("plugins skill states the fix-first lifecycle and backend contract", async () => {
    const content = stripSkillMetadata(await loadSkill("plugins"));
    expect(content).toContain("inspect_experience");
    expect(content).toContain("modify_plugin");
    expect(content).toContain("Never recreate to fix");
    expect(content).toContain("changeSummary");
    expect(content).toContain("plugin.created");
    expect(content).toContain("plugin.updated");
    expect(content).toContain("experience_errors");
    // The guest bridge genuinely exposes both helpers (host-bridge.ts,
    // guest-bridge.js): asserting their absence would pin a falsehood.
    expect(content).toContain("openContent");
    expect(content).toContain("useCapability");
  });

  it("dock skill states verbs, receipts, and routes", async () => {
    const content = stripSkillMetadata(await loadSkill("dock"));
    expect(content).toContain("dock.open");
    expect(content).toContain("dock.list");
    expect(content).toContain("never duplicate");
  });

  it("both replacement skills stay within the 600-token budget", async () => {
    for (const name of ["plugins", "dock"]) {
      expect(skillTokens(await loadSkill(name))).toBeLessThanOrEqual(600);
    }
  });

  it("runAgentLoop injects the plugins skill for a fix request", async () => {
    let capturedSystemMessage = "";

    const mockLlmClient: any = {
      chat: {
        completions: {
          create: async (params: any) => {
            const sys = params.messages.find((m: any) => m.role === "system");
            capturedSystemMessage = sys?.content || "";
            return {
              choices: [
                {
                  message: {
                    role: "assistant",
                    content: "Inspecting the reader before patching...",
                  },
                },
              ],
            };
          },
        },
      },
    };

    await runAgentLoop({
      prompt: "fix the reader",
      workspaceId: "quantum-computing",
      llmClient: mockLlmClient,
    });

    expect(capturedSystemMessage).toContain("Specialized Skill: plugins");
    expect(capturedSystemMessage).toContain("inspect_experience");
    expect(capturedSystemMessage).toContain("modify_plugin");
  });

  it("unknown skill names throw (fail loudly, never silently skip)", async () => {
    let threw = false;
    try {
      await loadSkill("web-research");
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  it("runAgentLoop injects the dock skill for a list request", async () => {
    let capturedSystemMessage = "";

    const mockLlmClient: any = {
      chat: {
        completions: {
          create: async (params: any) => {
            const sys = params.messages.find((m: any) => m.role === "system");
            capturedSystemMessage = sys?.content || "";
            return {
              choices: [{ message: { role: "assistant", content: "Listing tabs..." } }],
            };
          },
        },
      },
    };

    await runAgentLoop({
      prompt: "what tabs do I have",
      llmClient: mockLlmClient,
    });

    expect(capturedSystemMessage).toContain("Specialized Skill: dock");
    expect(capturedSystemMessage).toContain("dock.list");
  });

  it("isResearchIntent detects research queries; creation/update requests stay out", () => {
    expect(isResearchIntent("pesquise sobre transformers e gere um feed")).toBe(true);
    expect(isResearchIntent("find research papers on raft consensus")).toBe(true);
    expect(isResearchIntent("find articles about go to market")).toBe(true);
    expect(isResearchIntent("encontrar artigos sobre computação quântica")).toBe(true);
    expect(isResearchIntent("quais sao as fontes confiaveis")).toBe(true);
    expect(isResearchIntent("latest on muse spark pricing")).toBe(true);

    expect(isResearchIntent("hello world")).toBe(false);
    expect(isResearchIntent("change theme color to purple")).toBe(false);
    // Creation/update requests must NOT route to research, even though
    // they mention docs, quests, or feeds.
    expect(isResearchIntent("create docs for the project directory")).toBe(false);
    expect(isResearchIntent("create quests for quantum computing")).toBe(false);
    expect(isResearchIntent("learn about neural networks")).toBe(false);
    expect(isResearchIntent("add a quest")).toBe(false);
    expect(isResearchIntent("update the feed plugin")).toBe(false);
  });

  it("runAgentLoop injects the content-and-reader skill on research intent", async () => {
    let capturedSystemMessage = "";

    const mockLlmClient: any = {
      chat: {
        completions: {
          create: async (params: any) => {
            const sys = params.messages.find((m: any) => m.role === "system");
            capturedSystemMessage = sys?.content || "";
            return {
              choices: [
                {
                  message: {
                    role: "assistant",
                    content: "Researching topic with TinyFish...",
                  },
                },
              ],
            };
          },
        },
      },
    };

    await runAgentLoop({
      prompt: "pesquise os papers mais recentes sobre distributed systems",
      workspaceId: "distributed-systems",
      llmClient: mockLlmClient,
    });

    expect(capturedSystemMessage).toContain("Specialized Skill: content-and-reader");
    expect(capturedSystemMessage).toContain("search_web");
    expect(capturedSystemMessage).toContain("fetch_page");
    expect(capturedSystemMessage).toContain("untrusted data");
  });

  it("content-and-reader states the real fetch contract (no format arg)", async () => {
    const content = stripSkillMetadata(await loadSkill("content-and-reader"));
    expect(content).toContain("no `format` argument");
    expect(content).toContain("open_source");
    expect(content).not.toContain("format: markdown");
  });

  it("capabilities, memory, and verify skills state their contracts and budgets", async () => {
    const caps = stripSkillMetadata(await loadSkill("capabilities-and-mcp"));
    expect(caps).toContain("find_capabilities");
    expect(caps).toContain("invoke_capability");
    expect(caps).toContain("destructive");
    expect(caps).toContain("30s");

    const mem = stripSkillMetadata(await loadSkill("memory-and-files"));
    expect(mem).toContain("agent-home");
    expect(mem).toContain("record_memory");
    expect(mem).toContain("write_file");

    const verify = stripSkillMetadata(await loadSkill("verify-and-report"));
    expect(verify).toContain("already ran this turn");

    for (const name of ["capabilities-and-mcp", "content-and-reader", "memory-and-files", "verify-and-report"]) {
      expect(skillTokens(await loadSkill(name))).toBeLessThanOrEqual(600);
    }
  });
});

describe("App overview skill (always loaded, ~700 token budget)", () => {
  it("loads and stays within budget with metadata stripped", async () => {
    const raw = await loadSkill("app-overview");
    const stripped = stripSkillMetadata(raw);
    expect(stripped.length).toBeGreaterThan(500);
    expect(raw).toContain("<!--");
    expect(stripped).not.toContain("<!--");
    expect(skillTokens(raw)).toBeLessThanOrEqual(700);
  });

  it("maps concepts to homes and states the surface rule", async () => {
    const content = stripSkillMetadata(await loadSkill("app-overview"));
    expect(content).toContain("plugin_files");
    expect(content).toContain("window.polymax");
    expect(content).toContain("dock.list");
    expect(content).toContain("find_capabilities");
    expect(content).toContain("search_web");
    expect(content).toContain("Create a plugin only when the user wants something to come back to");
  });
});

describe("Domain skill selection (max two, PT+EN)", () => {
  const cases: Array<{ prompt: string; expected: string[] }> = [
    { prompt: "fix the reader", expected: ["plugins"] },
    { prompt: "arruma o reader", expected: ["plugins"] },
    { prompt: "open in reader doesn't work", expected: ["plugins"] },
    { prompt: "update the feed plugin to group by topic", expected: ["plugins"] },
    { prompt: "atualiza meu plugin pomodoro", expected: ["plugins"] },
    { prompt: "build a pomodoro timer", expected: ["plugins"] },
    { prompt: "build a tracker for my reading list", expected: ["plugins"] },
    { prompt: "find articles about go to market", expected: ["content-and-reader"] },
    { prompt: "pesquise artigos sobre estoicismo", expected: ["content-and-reader"] },
    { prompt: "open this article about raft", expected: ["content-and-reader"] },
    { prompt: "what tabs do I have", expected: ["dock"] },
    { prompt: "quais abas eu tenho", expected: ["dock"] },
    { prompt: "close the flashcards tab", expected: ["dock"] },
    { prompt: "fechar a aba de flashcards", expected: ["dock"] },
    { prompt: "open flashcards", expected: ["dock"] },
    { prompt: "open my pomodoro timer", expected: ["dock"] },
    { prompt: "invoke the search capability", expected: ["capabilities-and-mcp"] },
    { prompt: "remember my goal to master stoicism", expected: ["memory-and-files"] },
    { prompt: "lembre do meu objetivo", expected: ["memory-and-files"] },
    { prompt: "verify the feed plugin works", expected: ["plugins", "verify-and-report"] },
    { prompt: "hello", expected: [] },
    { prompt: "what is quantum computing?", expected: [] },
  ];

  for (const { prompt, expected } of cases) {
    it(`"${prompt}" -> [${expected.join(", ")}]`, () => {
      expect(selectDomainSkills(prompt)).toEqual(expected);
    });
  }

  it("never returns more than two skills", () => {
    expect(selectDomainSkills("fix the reader and verify it works").length).toBeLessThanOrEqual(2);
    expect(selectDomainSkills("research raft and build a plugin and remember this").length).toBeLessThanOrEqual(2);
  });

  it("fix requests reach plugins, never dock", () => {
    expect(isPluginFixIntent("open in reader doesn't work")).toBe(true);
    expect(isDockTabsIntent("open in reader doesn't work")).toBe(false);
    expect(isContentOpenIntent("open in reader doesn't work")).toBe(false);
    expect(isPluginUpdateIntent("update the feed plugin")).toBe(true);
    expect(isDockTabsIntent("close the flashcards tab")).toBe(true);
    expect(isVerifyIntent("did it work")).toBe(true);
    expect(isCapabilitiesIntent("invoke the search capability")).toBe(true);
    expect(isMemoryFilesIntent("list files in agent home")).toBe(true);
  });
});

describe("agent.start logs loaded skills", () => {
  it("emits skills next to model", async () => {
    const events: Array<{ type: string; payload?: Record<string, unknown> }> = [];
    const mockLlmClient: any = {
      chat: { completions: { create: async () => ({ choices: [{ message: { role: "assistant", content: "hi" } }] }) } },
    };
    await runAgentLoop({
      prompt: "find articles about go to market",
      llmClient: mockLlmClient,
      onEvent: async (e: any) => {
        events.push(e);
      },
    });
    const start = events.find((e) => e.type === "agent.start");
    expect(start).toBeDefined();
    expect(start?.payload?.model).toBeDefined();
    const skills = start?.payload?.skills as string[];
    expect(Array.isArray(skills)).toBe(true);
    // Research intent pulls the research protocol up front; the app map
    // loads on demand through read_skill (#209).
    expect(skills).toContain("content-and-reader");
    expect(skills).not.toContain("app-overview");
  });
});
