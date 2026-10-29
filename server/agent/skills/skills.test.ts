import { describe, expect, it } from "bun:test";
import {
  isTabSynthesisIntent,
  isResearchIntent,
  isWorldPlanningIntent,
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

describe("Agent Skills System & UI Synthesis Skill (create-tab)", () => {
  it("loadSkill loads create-tab.md with strict design tokens and bridge contract", async () => {
    const content = await loadSkill("create-tab");
    expect(content).toBeDefined();
    expect(content).toContain("#0A0A0C");
    expect(content).toContain("#C8FF57");
    expect(content).toContain("window.polymax");
    expect(content).toContain("window.polymax.storage");
    expect(content).toContain("Canonical Example 1: Interactive Flashcards");
    expect(content).toContain("Canonical Example 2: Research Paper Comparison Matrix");
  });

  it("loadSkill loads web-research.md skill", async () => {
    const content = await loadSkill("web-research");
    expect(content).toBeDefined();
    expect(content).toContain("TinyFish");
    expect(content).toContain("search_web");
    expect(content).toContain("fetch_page");
  });

  it("isTabSynthesisIntent detects tab creation prompts across languages", () => {
    expect(isTabSynthesisIntent("create a tab for flashcards")).toBe(true);
    expect(isTabSynthesisIntent("cria uma tab de resumo")).toBe(true);
    expect(isTabSynthesisIntent("build a tool for papers comparator")).toBe(true);
    expect(isTabSynthesisIntent("make a flashcard quiz")).toBe(true);
    expect(isTabSynthesisIntent("crie uma nova experiência na dock com um mapa do tema")).toBe(true);
    expect(isTabSynthesisIntent("create an interactive concept map")).toBe(true);

    expect(isTabSynthesisIntent("what is the weather today?")).toBe(false);
    expect(isTabSynthesisIntent("hello world")).toBe(false);
  });

  it("both canonical examples contain valid executable structures", async () => {
    const content = await loadSkill("create-tab");

    // Check Example 1: Flashcards
    expect(content).toContain("<div class=\"card-inner\" id=\"card\">");
    expect(content).toContain("function flipCard()");
    expect(content).toContain("window.polymax.storage.set('flashcard_score'");

    // Check Example 2: Paper Comparator
    expect(content).toContain("Research Paper Comparator");
    expect(content).toContain("function setFilter(filter)");
    expect(content).toContain("function openPaper(url)");
  });

  it("runAgentLoop dynamically injects create-tab skill into system messages on tab synthesis intent", async () => {
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
                    content: "Synthesizing flashcards tab now...",
                  },
                },
              ],
            };
          },
        },
      },
    };

    await runAgentLoop({
      prompt: "create a tab of flashcards for quantum computing",
      cityId: "quantum-computing",
      llmClient: mockLlmClient,
    });

    expect(capturedSystemMessage).toContain("Specialized Skill: Dynamic Tab Synthesis");
    expect(capturedSystemMessage).toContain("#0A0A0C");
    expect(capturedSystemMessage).toContain("#C8FF57");
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
    expect(isResearchIntent("create docs for the city directory")).toBe(false);
    expect(isResearchIntent("create quests for quantum computing")).toBe(false);
    expect(isResearchIntent("learn about neural networks")).toBe(false);
    expect(isResearchIntent("add a quest")).toBe(false);
    expect(isResearchIntent("update the feed plugin")).toBe(false);
  });

  it("runAgentLoop dynamically injects web-research skill into system prompt on research intent or city workspace", async () => {
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
      cityId: "distributed-systems",
      llmClient: mockLlmClient,
    });

    expect(capturedSystemMessage).toContain("Specialized Skill: Web Research & Primary Source Discovery (TinyFish)");
    expect(capturedSystemMessage).toContain("search_web");
    expect(capturedSystemMessage).toContain("fetch_page");
    expect(capturedSystemMessage).toContain("Autonomous Web Research & Discovery");
  });

  it("loadSkill loads world-planning.md skill with plan_map and build_city protocol", async () => {
    const content = await loadSkill("world-planning");
    expect(content).toBeDefined();
    expect(content).toContain("plan_map");
    expect(content).toContain("build_city");
    expect(content).toContain("TinyFish");
  });

  it("isWorldPlanningIntent detects knowledge domain and world planning queries in English and Portuguese", () => {
    expect(isWorldPlanningIntent("criar nova area de conhecimento")).toBe(true);
    expect(isWorldPlanningIntent("criar uma nova área de conhecimento sobre computação quântica")).toBe(true);
    expect(isWorldPlanningIntent("quero aprender sobre física quântica")).toBe(true);
    expect(isWorldPlanningIntent("plan the map for distributed systems")).toBe(true);
    expect(isWorldPlanningIntent("expand the world map")).toBe(true);
    expect(isWorldPlanningIntent("want to learn neuroscience")).toBe(true);
    expect(isWorldPlanningIntent("build city for transformers")).toBe(true);

    expect(isWorldPlanningIntent("what time is it?")).toBe(false);
    expect(isWorldPlanningIntent("change accent to lime")).toBe(false);
  });

  it("runAgentLoop dynamically injects world-planning skill into system prompt on world planning intent", async () => {
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
                    content: "Planning new knowledge territory...",
                  },
                },
              ],
            };
          },
        },
      },
    };

    await runAgentLoop({
      prompt: "quero aprender sobre mecânica quântica e criar nova area de conhecimento",
      llmClient: mockLlmClient,
    });

    expect(capturedSystemMessage).toContain("Specialized Skill: Knowledge Territories & World Map Planning");
    expect(capturedSystemMessage).toContain("plan_map");
    expect(capturedSystemMessage).toContain("build_city");
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
    expect(content).toContain("workspace/<city>/");
    expect(content).toContain("window.polymax");
    expect(content).toContain("list_tabs");
    expect(content).toContain("find_capabilities");
    expect(content).toContain("search_web");
    expect(content).toContain("Create a tab only when the user wants something to come back to");
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
    { prompt: "find articles about go to market", expected: ["content-and-reader"] },
    { prompt: "pesquise artigos sobre estoicismo", expected: ["content-and-reader"] },
    { prompt: "open this article about raft", expected: ["content-and-reader"] },
    { prompt: "cria uma cidade sobre estoicismo", expected: ["world-and-cities"] },
    { prompt: "build city for transformers", expected: ["world-and-cities"] },
    { prompt: "what tabs do I have", expected: ["dock-and-tabs"] },
    { prompt: "quais abas eu tenho", expected: ["dock-and-tabs"] },
    { prompt: "close the flashcards tab", expected: ["dock-and-tabs"] },
    { prompt: "fechar a aba de flashcards", expected: ["dock-and-tabs"] },
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
    expect(selectDomainSkills("research raft and build a city and remember this").length).toBeLessThanOrEqual(2);
  });

  it("fix requests reach plugins, never dock-and-tabs", () => {
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
    expect(skills).toContain("app-overview");
  });
});
