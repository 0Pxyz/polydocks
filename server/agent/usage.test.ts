import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { extractUsage, priceTurn, recordTurnUsage, resetDailyUsage, utcDate } from "./usage";

describe("Turn usage accounting (measured, not estimated)", () => {
  let tmpDir: string;
  let prevUsageDir: string | undefined;
  let prevInRate: string | undefined;
  let prevOutRate: string | undefined;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "polymax-usage-"));
    prevUsageDir = process.env.AGENT_USAGE_DIR;
    prevInRate = process.env.MODEL_INPUT_PRICE_PER_1K;
    prevOutRate = process.env.MODEL_OUTPUT_PRICE_PER_1K;
    process.env.AGENT_USAGE_DIR = tmpDir;
    delete process.env.MODEL_INPUT_PRICE_PER_1K;
    delete process.env.MODEL_OUTPUT_PRICE_PER_1K;
    resetDailyUsage();
  });

  afterEach(async () => {
    if (prevUsageDir === undefined) delete process.env.AGENT_USAGE_DIR;
    else process.env.AGENT_USAGE_DIR = prevUsageDir;
    if (prevInRate === undefined) delete process.env.MODEL_INPUT_PRICE_PER_1K;
    else process.env.MODEL_INPUT_PRICE_PER_1K = prevInRate;
    if (prevOutRate === undefined) delete process.env.MODEL_OUTPUT_PRICE_PER_1K;
    else process.env.MODEL_OUTPUT_PRICE_PER_1K = prevOutRate;
    resetDailyUsage();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("extracts token counts from a completions response", () => {
    expect(extractUsage({ usage: { prompt_tokens: 1200, completion_tokens: 300 } })).toEqual({
      inputTokens: 1200,
      outputTokens: 300,
    });
    expect(extractUsage({ choices: [] })).toEqual({ inputTokens: 0, outputTokens: 0 });
    expect(extractUsage(null)).toEqual({ inputTokens: 0, outputTokens: 0 });
  });

  it("cost stays 0 without configured rates, uses env rates when set", () => {
    expect(priceTurn(1000, 500)).toBe(0);
    process.env.MODEL_INPUT_PRICE_PER_1K = "0.5";
    process.env.MODEL_OUTPUT_PRICE_PER_1K = "2";
    expect(priceTurn(1000, 500)).toBeCloseTo(1.5);
  });

  it("records a turn and accumulates the daily total", async () => {
    process.env.MODEL_INPUT_PRICE_PER_1K = "1";
    process.env.MODEL_OUTPUT_PRICE_PER_1K = "3";
    const first = await recordTurnUsage({ inputTokens: 1000, outputTokens: 100, steps: 2, skills: ["app-overview"] });
    expect(first.turn.costUsd).toBeCloseTo(1.3);
    expect(first.daily.turns).toBe(1);
    expect(first.daily.inputTokens).toBe(1000);

    const second = await recordTurnUsage({ inputTokens: 500, outputTokens: 0, steps: 1, skills: [] });
    expect(second.daily.turns).toBe(2);
    expect(second.daily.inputTokens).toBe(1500);
    expect(second.daily.costUsd).toBeCloseTo(1.8);

    const lines = (await fs.readFile(path.join(tmpDir, `${utcDate()}.jsonl`), "utf-8")).trim().split("\n");
    expect(lines.length).toBe(2);
    expect(JSON.parse(lines[0]).skills).toEqual(["app-overview"]);
  });
});
