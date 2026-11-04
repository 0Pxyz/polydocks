import { describe, it, expect } from "bun:test";
import fs from "node:fs";
import path from "node:path";

/**
 * Demo script contract (#366): the 3-act structure exists on paper before
 * anyone presses record — acts, pitch, exact prompts, and the do-not-show
 * guardrails. Recording itself needs a human (#353).
 */
describe("demo script (#366)", () => {
  const root = path.resolve(import.meta.dir, "..");
  const docPath = path.join(root, "internal-docs/demo-script.md");
  // Private team doc: absent on public checkouts (gitignored). Skip the
  // contract there; it still guards local dev where the doc exists.
  const raw = fs.existsSync(docPath) ? fs.readFileSync(docPath, "utf-8") : null;
  const docIt = raw ? it : it.skip;
  // Blockquote line-breaks are rendering, not content: flatten them.
  const script = (raw || "").replace(/^>\s?/gm, "").replace(/\s+/g, " ");

  docIt("follows Request -> Creation -> Payoff", () => {
    expect(script).toContain("Act 1");
    expect(script).toContain("Act 2");
    expect(script).toContain("Act 3");
    expect(script).toMatch(/request/i);
    expect(script).toMatch(/payoff/i);
  });

  docIt("carries the pitch, exact prompts and recording checklist", () => {
    expect(script).toContain("what if an agent could build the tools it needs?");
    expect(script).toContain("Box Breathing");
    expect(script).toContain("4-4-4-4");
    expect(script).toContain("Setup checklist");
    expect(script).toContain("1920");
  });

  docIt("names the guardrails (no reloads, no unmapped surfaces)", () => {
    expect(script).toContain("Do-not-show");
    expect(script).toContain("reload");
    expect(script).toContain("Bitcoin");
    expect(script).toContain("console");
  });
});
