import { describe, expect, it } from "bun:test";
import fs from "node:fs/promises";
import { AGENT_GUIDELINES_EXTRACT } from "./guidelines";
import { runAgentLoop } from "./loop";

describe("AGENTS.md runtime extract (<= 400 tokens, derived from source)", () => {
  it("stays within budget", () => {
    expect(AGENT_GUIDELINES_EXTRACT.length / 4).toBeLessThanOrEqual(400);
    expect(AGENT_GUIDELINES_EXTRACT.length).toBeGreaterThan(200);
  });

  it("every key phrase traces back to AGENTS.md", async () => {
    const source = await fs.readFile("AGENTS.md", "utf-8");
    for (const phrase of [
      "Everything in this repository must always be in English",
      "The Dock IS the product",
      "primary sources",
      "design tokens",
      "granted",
      "approval",
      "sandboxed",
      "untrusted",
      "Out of scope for the agent",
      "say so in the PR",
    ]) {
      expect(source, `AGENTS.md should contain: ${phrase}`).toContain(phrase);
    }
  });

  it("the loop injects the extract, not the full file", async () => {
    let captured = "";
    const mockLlmClient: any = {
      chat: { completions: { create: async (params: any) => {
        captured = params.messages.find((m: any) => m.role === "system")?.content || "";
        return { choices: [{ message: { role: "assistant", content: "ok" } }] };
      } } },
    };
    await runAgentLoop({ prompt: "hello", llmClient: mockLlmClient });
    expect(captured).toContain("Out of scope without a backlog issue");
    expect(captured).not.toContain("Conventional Commits");
    expect(captured).not.toContain("Source of truth for work is");
  });
});
