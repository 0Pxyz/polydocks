import { describe, expect, it } from "bun:test";
import { minimalTools, fullTools, defaultTools } from "../server/agent/tools/index";
import { config } from "../server/config";

describe("intent-scoped minimal surface", () => {
  it("schema default is minimal (code evidence, env-independent)", async () => {
    const src = await Bun.file("server/config.ts").text();
    expect(src).toContain('AGENT_SURFACE: z.enum(["full", "minimal"]).default("minimal")');
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

  it("minimal context is smaller than full", () => {
    expect(minimalTools.length).toBeLessThan(fullTools.length);
  });
});
