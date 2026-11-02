import { describe, expect, it } from "bun:test";
import { SCENARIOS, runAllScenarios, summarize } from "../scripts/eval/scenarios";

describe("agent eval harness", () => {
  it("defines 15-20 scenarios covering the required kinds", () => {
    expect(SCENARIOS.length).toBeGreaterThanOrEqual(15);
    expect(SCENARIOS.length).toBeLessThanOrEqual(20);
    const kinds = new Set(SCENARIOS.map((s) => s.kind));
    for (const k of ["open-tab", "open-plugin", "fix-plugin", "create-plugin", "ambiguous", "duplicate-avoidance"]) {
      expect(kinds.has(k as any)).toBe(true);
    }
  });

  it("runs fully mocked and reports metrics", async () => {
    const results = await runAllScenarios();
    expect(results.length).toBe(SCENARIOS.length);
    const summary = summarize(results);
    expect(summary.total).toBe(SCENARIOS.length);
    expect(summary.toolCalls).toBeGreaterThan(0);
    // Metrics present on every result.
    for (const r of results) {
      expect(typeof r.toolCalls).toBe("number");
      expect(typeof r.latencyMs).toBe("number");
      expect(typeof r.inputTokens).toBe("number");
      expect(typeof r.outputTokens).toBe("number");
    }
    // Baseline is high: scripted happy paths should mostly pass.
    expect(summary.successRate).toBeGreaterThanOrEqual(0.8);
  });
});
