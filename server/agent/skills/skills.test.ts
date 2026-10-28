import { describe, expect, it } from "bun:test";
import { isTabSynthesisIntent, isResearchIntent, isWorldPlanningIntent, loadSkill } from "./index";
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

  it("isResearchIntent detects research, discovery, and knowledge queries across languages", () => {
    expect(isResearchIntent("pesquise sobre transformers e gere um feed")).toBe(true);
    expect(isResearchIntent("find research papers on raft consensus")).toBe(true);
    expect(isResearchIntent("create docs for the city directory")).toBe(true);
    expect(isResearchIntent("create quests for quantum computing")).toBe(true);
    expect(isResearchIntent("learn about neural networks")).toBe(true);
    expect(isResearchIntent("quais sao as fontes confiaveis")).toBe(true);

    expect(isResearchIntent("hello world")).toBe(false);
    expect(isResearchIntent("change theme color to purple")).toBe(false);
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
