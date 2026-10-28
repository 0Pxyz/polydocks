import { describe, expect, it } from "bun:test";
import { isTabSynthesisIntent, isResearchIntent, loadSkill } from "./index";
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
});
