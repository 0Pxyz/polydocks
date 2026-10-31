import fs from "node:fs/promises";
import path from "node:path";

/**
 * Per-turn token accounting for the agent loop. The model is the only
 * measured source: every Chat Completions response carries `usage`, so the
 * loop accumulates input/output tokens across steps and reports them in
 * `agent.finish` alongside steps and loaded skills. Cost is derived from
 * operator-configured rates (USD per 1K tokens); when the env vars are
 * absent the token counts are still recorded and cost stays 0.
 */

export interface TurnUsage {
  inputTokens: number;
  outputTokens: number;
  /** Prefix-cache hits this turn (`usage.input_tokens_details.cached_tokens`,
   *  #223). Zero when the provider reports none (mocks, Chat fallback). */
  cachedTokens: number;
  steps: number;
  skills: string[];
  costUsd: number;
}

export interface DailyUsage {
  date: string;
  turns: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  costUsd: number;
}

const dailyTotals = new Map<string, DailyUsage>();

export function utcDate(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function usageRates(): { inputPer1K: number; outputPer1K: number } {
  const inputPer1K = Number(process.env.MODEL_INPUT_PRICE_PER_1K ?? 0);
  const outputPer1K = Number(process.env.MODEL_OUTPUT_PRICE_PER_1K ?? 0);
  return {
    inputPer1K: Number.isFinite(inputPer1K) && inputPer1K > 0 ? inputPer1K : 0,
    outputPer1K: Number.isFinite(outputPer1K) && outputPer1K > 0 ? outputPer1K : 0,
  };
}

/** Cost of one turn in USD from configured per-1K rates. */
export function priceTurn(inputTokens: number, outputTokens: number): number {
  const { inputPer1K, outputPer1K } = usageRates();
  return (inputTokens / 1000) * inputPer1K + (outputTokens / 1000) * outputPer1K;
}

/** Pull `{ prompt_tokens, completion_tokens }` out of a completions response. */
export function extractUsage(response: unknown): {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
} {
  const usage = (response as any)?.usage;
  const inputTokens = Number(usage?.prompt_tokens ?? usage?.input_tokens ?? 0);
  const outputTokens = Number(usage?.completion_tokens ?? usage?.output_tokens ?? 0);
  // Automatic prefix caching (#223): stable prompt + tool prefix first,
  // variable content last, loaded tool set stable — hits land here.
  const details = usage?.input_tokens_details ?? usage?.prompt_tokens_details ?? {};
  const cachedTokens = Number(details?.cached_tokens ?? 0);
  const num = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);
  return { inputTokens: num(inputTokens), outputTokens: num(outputTokens), cachedTokens: num(cachedTokens) };
}

export function usageDir(): string {
  return process.env.AGENT_USAGE_DIR ?? path.resolve(process.cwd(), "agent-home", "usage");
}

/**
 * Records one finished turn: updates the in-memory daily total and
 * best-effort appends a JSONL line under the usage dir. Never throws.
 */
export async function recordTurnUsage(entry: {
  inputTokens: number;
  outputTokens: number;
  cachedTokens?: number;
  steps: number;
  skills: string[];
}): Promise<{ turn: TurnUsage; daily: DailyUsage }> {
  const date = utcDate();
  const cachedTokens = entry.cachedTokens ?? 0;
  const costUsd = priceTurn(entry.inputTokens, entry.outputTokens);
  const turn: TurnUsage = { ...entry, cachedTokens, costUsd };
  const prev = dailyTotals.get(date) ?? { date, turns: 0, inputTokens: 0, outputTokens: 0, cachedTokens: 0, costUsd: 0 };
  const daily: DailyUsage = {
    date,
    turns: prev.turns + 1,
    inputTokens: prev.inputTokens + entry.inputTokens,
    outputTokens: prev.outputTokens + entry.outputTokens,
    cachedTokens: prev.cachedTokens + cachedTokens,
    costUsd: prev.costUsd + costUsd,
  };
  dailyTotals.set(date, daily);

  try {
    const dir = usageDir();
    await fs.mkdir(dir, { recursive: true });
    await fs.appendFile(path.join(dir, `${date}.jsonl`), `${JSON.stringify({ ...turn, date })}\n`, "utf-8");
  } catch {
    // Usage accounting must never break the agent turn.
  }
  return { turn, daily };
}

/** Testing seam: reset in-memory daily totals. */
export function resetDailyUsage(): void {
  dailyTotals.clear();
}
