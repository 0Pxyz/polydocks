import { describe, expect, it } from "bun:test";
import { minimalTools, fullTools, defaultTools } from "../server/agent/tools/index";
import { config } from "../server/config";

describe("intent-scoped minimal surface", () => {
  it("schema default is full (code evidence, env-independent)", async () => {
    const src = await Bun.file("server/config.ts").text();
    expect(src).toContain('AGENT_SURFACE: z.enum(["full", "minimal"]).default("full")');
    expect(["full", "minimal"]).toContain(config.AGENT_SURFACE);
  });

  it("starts with dock verbs plus find_capabilities", () => {
    const names = minimalTools.map((t) => t.name);
    for (const n of ["dock.open", "dock.close", "dock.pin", "dock.unpin", "dock.list", "find_capabilities"]) {
      expect(names).toContain(n);
    }
  });

  it("ships plugins.install on every surface", () => {
    const min = minimalTools.map((t) => t.name);
    const full = fullTools.map((t) => t.name);
    expect(min).toContain("plugins.install");
    expect(full).toContain("install_plugin");
  });

  it("theme intent turns can reach apply_theme on the default surface", async () => {
    const { INTENT_TOOL_DENYLIST } = await import("../server/agent/intent");
    const min = minimalTools.map((t) => t.name);
    // The theme skill names apply_theme explicitly; the tool must be
    // offered (not denied, not surface-filtered) or the model correctly
    // reports "theme control isn't available" (regression from #219).
    expect(min).toContain("apply_theme");
    expect(INTENT_TOOL_DENYLIST.theme).not.toContain("apply_theme");
  });

  it("memory intent turns can reach record_memory/recall_memory on the default surface (#265)", async () => {
    const { INTENT_TOOL_DENYLIST } = await import("../server/agent/intent");
    const min = minimalTools.map((t) => t.name);
    // The memory-and-files skill names record_memory/recall_memory
    // explicitly; the tools must be offered (not denied, not
    // surface-filtered) or the model confabulates confirmations with zero
    // tool calls (same class as the #264 apply_theme regression).
    expect(min).toContain("record_memory");
    expect(min).toContain("recall_memory");
    expect(INTENT_TOOL_DENYLIST.general).not.toContain("record_memory");
    expect(INTENT_TOOL_DENYLIST.general).not.toContain("recall_memory");
  });

  it("minimal context is smaller than full", () => {
    expect(minimalTools.length).toBeLessThan(fullTools.length);
  });
});
