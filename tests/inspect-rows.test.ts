import { describe, expect, it } from "bun:test";
import { summarizeInspectEvent, buildInspectRows } from "../src/lib/inspect/inspectRows";

/**
 * Inspect row contract (#181): real events in, shapes out. Secrets,
 * prompt text, argument values, and full URLs never reach a row.
 */
describe("inspect rows (#181)", () => {
  it("maps request → fast-path decision → action → result", () => {
    const rows = buildInspectRows([
      { type: "agent.start", step: 0, payload: { prompt: "open browser please", model: "muse-spark-1.3" } },
      { type: "tool.start", step: 1, payload: { name: "dock.open", deterministic: true, reason: "imperative open" } },
      { type: "tool.done", step: 1, payload: { name: "dock.open", result: { ok: true } } },
      { type: "agent.finish", step: 1, payload: { text: "Opened browser." } },
    ]);
    expect(rows.map((r) => r.kind)).toEqual(["request", "decision", "result", "result"]);
    expect(rows[1].deterministic).toBe(true);
  });

  it("never leaks argument values, prompts, or secrets", () => {
    const secret = "sk-ant-secret-value-abcdef123456";
    const rows = buildInspectRows([
      { type: "agent.start", payload: { prompt: `use key ${secret}` } },
      { type: "tool.start", payload: { name: "sandbox_exec", arguments: { command: `export K=${secret}`, apiKey: secret } } },
      { type: "browser.open", payload: { url: `https://example.com/cb?token=${secret}` } },
    ]);
    const flat = JSON.stringify(rows);
    expect(flat.includes(secret)).toBe(false);
    expect(flat.includes("example.com")).toBe(true);
    expect(flat.includes("token=")).toBe(false);
    // Keys (shapes) survive; values do not.
    expect(rows[1].detail.includes("command")).toBe(true);
    expect(rows[1].detail.includes("apiKey")).toBe(true);
  });

  it("maps errors and plugin lifecycle events", () => {
    const rows = buildInspectRows([
      { type: "error", payload: { message: "boom" } },
      { type: "plugin.created", payload: { pluginId: "bitcoin" } },
      { type: "tray.open", payload: {} },
    ]);
    expect(rows.map((r) => `${r.kind}:${r.label}`)).toEqual([
      "error:Error",
      "action:plugin.created",
    ]);
  });

  it("yields zero rows for empty or unknown input (honest empty states)", () => {
    expect(buildInspectRows([])).toEqual([]);
    expect(buildInspectRows([{ type: "heartbeat" }, { type: "tray.open" }])).toEqual([]);
    expect(summarizeInspectEvent({ type: "agent.start", payload: {} }, 0)?.detail).toContain("0 chars");
  });

  it("maps routing decisions without prompts or args", () => {
    const rows = buildInspectRows([
      { type: "message.done", payload: { decision: { kind: "create_tool", confidence: 0.8, reason: "explicit build verb" }, text: "secret prompt text" } },
      { type: "message.error", payload: { decision: { kind: "cancel_task", reason: "cancel keywords" } } },
      { type: "message.done", payload: { text: "plain answer, no decision" } },
    ]);
    expect(rows.map((r) => `${r.kind}:${r.label}`)).toEqual([
      "decision:route: create_tool",
      "decision:route: cancel_task",
    ]);
    expect(rows[0].detail).toContain("explicit build verb");
    expect(rows[0].detail).toContain("80%");
    const flat = JSON.stringify(rows);
    expect(flat.includes("secret prompt text")).toBe(false);
  });

  it("maps job states, shapes only", () => {
    const rows = buildInspectRows([
      { type: "job.queued", payload: { jobId: "task_1234567890_abcdef12" } },
      { type: "job.progress", payload: { jobId: "task_1234567890_abcdef12", progress: 0.5 } },
      { type: "job.completed", payload: { jobId: "task_1234567890_abcdef12", summary: "secret summary text" } },
      { type: "job.failed", payload: { jobId: "task_x", error: "secret failure detail" } },
    ]);
    expect(rows.map((r) => `${r.kind}:${r.label}`)).toEqual([
      "action:job abcdef12 queued",
      "action:job abcdef12 progress",
      "result:job abcdef12 done",
      "error:job x failed",
    ]);
    expect(rows[1].detail).toBe("50%");
    const flat = JSON.stringify(rows);
    expect(flat.includes("secret summary text")).toBe(false);
    expect(flat.includes("secret failure detail")).toBe(false);
  });

  it("shows token counts and nonzero cost on finish", () => {
    const row = summarizeInspectEvent(
      { type: "agent.finish", payload: { text: "hi", inputTokens: 100, outputTokens: 20, costUsd: 0.0012 } },
      0
    );
    expect(row?.detail).toContain("100 in");
    expect(row?.detail).toContain("20 out");
    expect(row?.detail).toContain("$0.0012");
    const free = summarizeInspectEvent({ type: "agent.finish", payload: { text: "hi" } }, 0);
    expect(free?.detail).not.toContain("$");
  });
});
