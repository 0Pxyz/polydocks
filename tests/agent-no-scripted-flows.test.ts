import { describe, expect, it } from "bun:test";
import { z } from "zod";
import { runAgentLoop } from "../server/agent/loop";

/**
 * #206: no hardcoded step-by-step flows in code or skills.
 * Agent behavior comes from principles in the prompt plus real
 * enforcement (install policy gate, receipts, duplicate refusal).
 */
describe("no scripted flows (principles over scripts)", () => {
  it("loop.ts has no numbered-step procedure or dead skill branch", async () => {
    const src = await Bun.file("server/agent/loop.ts").text();
    expect(src).not.toContain("dock-and-tabs");
    expect(src).not.toContain("Dock Add Request Instructions");
    // The dock-add block prescribes no step order.
    expect(src).not.toMatch(/origin.*dock-add[\s\S]{0,400}1\.\s+\S+[\s\S]{0,200}2\.\s+/);
  });

  it("skills state principles, not numbered procedures", async () => {
    for (const name of ["sandbox", "theme", "plugins", "dock", "app-overview", "content-and-reader", "memory-and-files", "verify-and-report", "capabilities-and-mcp"]) {
      const raw = await Bun.file(`server/agent/skills/${name}.md`).text();
      expect(raw).not.toMatch(/^### Step \d/m);
      expect(raw).not.toMatch(/^[0-9]\.\s+\S/m);
    }
    const sandbox = await Bun.file("server/agent/skills/sandbox.md").text();
    expect(sandbox).toContain("## Principles");
    const theme = await Bun.file("server/agent/skills/theme.md").text();
    expect(theme).toContain("## Principles");
  });

  it("dock-add origin still completes via principles (scripted model)", async () => {
    const tool = {
      name: "create_plugin",
      description: "test double",
      schema: z.object({}).passthrough(),
      execute: async () => ({ success: true, ok: true, pluginId: "p1" }),
    };
    const llmClient = {
      chat: {
        completions: {
          create: async () => ({
            usage: { prompt_tokens: 10, completion_tokens: 5 },
            choices: [{ message: { role: "assistant", content: "Done." } }],
          }),
        },
      },
    };
    const res = await runAgentLoop({
      prompt: "build me a timer",
      origin: "dock-add",
      tools: [tool as any],
      llmClient: llmClient as any,
    });
    expect(res.status).toBe("completed");
  });
});
