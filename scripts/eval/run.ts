import fs from "node:fs/promises";
import path from "node:path";
import { SCENARIOS, runAllScenarios, summarize } from "./scenarios";

const outDir = path.resolve(process.cwd(), "eval-results");

async function main() {
  const startedAt = new Date().toISOString();
  const results = await runAllScenarios();
  const summary = summarize(results);
  const payload = { startedAt, summary, scenarios: SCENARIOS.map((s) => s.id), results };
  await fs.mkdir(outDir, { recursive: true });
  const stamp = startedAt.replace(/[:.]/g, "-");
  const file = path.join(outDir, `eval-${stamp}.json`);
  await fs.writeFile(file, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
  // Stable reference for CI diffs and PR deltas.
  await fs.writeFile(path.join(outDir, "latest.json"), `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
  const lines = [
    `# Eval report (${startedAt})`,
    ``,
    `- scenarios: ${summary.total}, passed: ${summary.passed} (${(summary.successRate * 100).toFixed(1)}%)`,
    `- tool calls: ${summary.toolCalls}, duplicated runs: ${summary.duplicated}`,
    `- latency: ${summary.latencyMs}ms, tokens: ${summary.inputTokens} in / ${summary.outputTokens} out`,
    ``,
    ...results.map((r) => `- ${r.success ? "PASS" : "FAIL"} ${r.id} calls=${r.toolCalls} dup=${r.duplicated ? "yes" : "no"} lat=${r.latencyMs}ms`),
  ];
  await fs.writeFile(path.join(outDir, "latest.md"), `${lines.join("\n")}\n`, "utf-8");
  console.log(lines.join("\n"));
  console.log(`\nWrote ${file}`);
}

await main();
