import { describe, expect, it } from "bun:test";
import { getMainPrompt, loadMainPrompt, resetMainPromptCache } from "./index";

/** Principle-based main prompt (#208): versioned file, no procedures. */
describe("principle-based main prompt", () => {
  it("loads a versioned prompt with identity and invariants", () => {
    resetMainPromptCache();
    const { version, text } = getMainPrompt();
    expect(version).toBeGreaterThanOrEqual(1);
    expect(text).toContain("You are the Polymax Agent");
    expect(text).toContain("## Mental model");
    expect(text).toContain("## Invariants");
    expect(text).toContain("## Decision style");
    expect(text).toContain("receipts are the truth");
    expect(text).toContain("Decide and state assumptions");
  });

  it("contains no numbered procedures", () => {
    const { text } = loadMainPrompt();
    for (const line of text.split("\n")) {
      expect(/^\s*\d+[.)]\s+\S/.test(line)).toBe(false);
    }
  });

  it("caches the parsed prompt", () => {
    resetMainPromptCache();
    expect(getMainPrompt().text).toBe(getMainPrompt().text);
  });
});
