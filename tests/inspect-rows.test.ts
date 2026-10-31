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
});
