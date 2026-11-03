import { describe, expect, it } from "bun:test";
import { parseCuratedMemory, parseDailyEntries } from "../src/features/settings/MemoryInspectorView";
import { buildMemoryChipContent } from "../src/lib/agent/events";
import { applyOrchestratorAction } from "../src/lib/agent/orchestratorActions";
import { useConversationStore } from "../src/lib/agent/conversationStore";

/**
 * Memory inspector UI + transcript badge (#105).
 * Pure helpers stay framework-free; the badge path runs through the real
 * shared orchestrator action so legacy and job turns behave identically.
 */
describe("memory inspector parsing (#105)", () => {
  const md = [
    "# Long-Term Curated Memory",
    "",
    "## User Insights & Preferences",
    "",
    "- prefers dark mode",
    "- drinks tea",
    "",
    "## Architectural Guidelines",
    "",
    "- single-file plugins",
    "",
    "## Something Custom",
    "",
    "- kept verbatim",
  ].join("\n");

  it("groups bullets by category from section headers", () => {
    const { groups, lines } = parseCuratedMemory(md);
    expect(groups.length).toBe(3);
    expect(groups[0].category).toBe("user_preference");
    expect(groups[0].lineIndices.map((i) => lines[i])).toEqual(["- prefers dark mode", "- drinks tea"]);
    expect(groups[1].category).toBe("architectural_rule");
    expect(groups[2].category).toBe("general");
    expect(groups[2].header).toBe("## Something Custom");
  });

  it("returns no groups for empty memory", () => {
    expect(parseCuratedMemory("# Long-Term Curated Memory\n").groups).toEqual([]);
    expect(parseCuratedMemory("").groups).toEqual([]);
  });

  it("parses daily log entries", () => {
    const entries = parseDailyEntries("# Daily Memory Log - 2026-11-03\n\n- [10:00:00] [general]: hello\nnot a bullet\n- [11:00:00] [user_preference]: dark mode\n");
    expect(entries).toEqual([
      "- [10:00:00] [general]: hello",
      "- [11:00:00] [user_preference]: dark mode",
    ]);
  });
});

describe("memory transcript badge (#105)", () => {
  it("builds a plain line from a successful record result", () => {
    expect(
      buildMemoryChipContent({
        recorded: true,
        entry: "- [10:00:00] [user_preference]: User prefers dark mode",
        durable: false,
        dailyFile: "memory/2026-11-03.md",
      })
    ).toBe("Remembered: User prefers dark mode");
  });

  it("returns null for anything that is not a successful record", () => {
    expect(buildMemoryChipContent(null)).toBeNull();
    expect(buildMemoryChipContent({ recorded: false, entry: "x" })).toBeNull();
    expect(buildMemoryChipContent({ recorded: true })).toBeNull();
    expect(buildMemoryChipContent({ memories: ["a"] })).toBeNull();
  });

  it("truncates long entries", () => {
    const chip = buildMemoryChipContent({ recorded: true, entry: `- [t] [general]: ${"x".repeat(200)}` });
    expect(chip).not.toBeNull();
    expect(chip!.length).toBeLessThan(160);
    expect(chip!.endsWith("…")).toBe(true);
  });

  it("appends one ephemeral tool message on record_memory completion", async () => {
    useConversationStore.setState({ messages: [] });
    await applyOrchestratorAction({
      type: "tool.completed",
      step: 1,
      id: "tool-1",
      name: "record_memory",
      result: { recorded: true, entry: "- [10:00:00] [user_preference]: User prefers dark mode" },
    });
    const after = useConversationStore.getState().messages;
    expect(after.length).toBe(1);
    expect(after[0].role).toBe("tool");
    expect(after[0].toolName).toBe("record_memory");
    expect(after[0].content).toBe("Remembered: User prefers dark mode");

    // Replay-safe: same tool id never duplicates.
    await applyOrchestratorAction({
      type: "tool.completed",
      step: 1,
      id: "tool-1",
      name: "record_memory",
      result: { recorded: true, entry: "- [10:00:00] [user_preference]: User prefers dark mode" },
    });
    expect(useConversationStore.getState().messages.length).toBe(1);
  });

  it("ignores other tools and failed records", async () => {
    useConversationStore.setState({ messages: [] });
    await applyOrchestratorAction({ type: "tool.completed", step: 1, id: "t-2", name: "search_web", result: { ok: true } });
    await applyOrchestratorAction({ type: "tool.completed", step: 1, id: "t-3", name: "record_memory", result: { recorded: false } });
    expect(useConversationStore.getState().messages).toEqual([]);
  });
});
