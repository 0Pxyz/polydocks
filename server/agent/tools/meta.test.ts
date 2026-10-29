import { describe, it, expect, afterEach } from "bun:test";
import { defaultTools, minimalTools, getToolsForSurface, metaActionMap } from "./index";
import { MINIMAL_WHOLE_DENYLIST, MINIMAL_ACTION_DENYLIST } from "../intent";

const MINIMAL_NAMES = ["dock", "plugins", "capabilities", "fs", "web", "map", "memory", "executions", "apply_theme"];

describe("Minimal tool surface (AGENT_SURFACE=minimal)", () => {
  const savedSurface = process.env.AGENT_SURFACE;
  afterEach(() => {
    if (savedSurface === undefined) delete process.env.AGENT_SURFACE;
    else process.env.AGENT_SURFACE = savedSurface;
  });

  it("offers 9 meta-tools instead of the full catalog", () => {
    expect(minimalTools.map((t) => t.name).sort()).toEqual([...MINIMAL_NAMES].sort());
    expect(defaultTools.length).toBeGreaterThan(minimalTools.length);
  });

  it("keeps every classic tool registered exactly once as a meta action (alias, none lost)", () => {
    const seen = new Map<string, string>();
    for (const [metaName, actions] of Object.entries(metaActionMap)) {
      for (const action of actions) {
        expect(seen.has(action)).toBe(false);
        seen.set(action, metaName);
      }
    }
    const classic = defaultTools.map((t) => t.name).filter((n) => n !== "apply_theme");
    expect([...seen.keys()].sort()).toEqual(classic.sort());
    for (const t of defaultTools) {
      expect(typeof t.execute).toBe("function");
    }
  });

  it("dispatches dock actions to the classic tools", async () => {
    const dock = minimalTools.find((t) => t.name === "dock")!;
    const res = (await dock.execute({ operation: "close_tray" }, { step: 0 })) as any;
    expect(res.success).toBe(true);
    expect(res.action).toBe("tray.close");
  });

  it("delegates plugins inspect and reports unknown actions as errors", async () => {
    const plugins = minimalTools.find((t) => t.name === "plugins")!;
    const missing = (await plugins.execute({ operation: "inspect_experience", id: "no-such-plugin" }, { step: 0 })) as any;
    expect(missing.success).toBe(false);
    const unknown = (await plugins.execute({ operation: "nope" }, { step: 0 })) as any;
    expect(unknown.success).toBe(false);
    expect(String(unknown.error)).toContain("Unknown plugins action");
  });

  it("rejects unknown actions at schema level", () => {
    const dock = minimalTools.find((t) => t.name === "dock")!;
    expect(dock.schema.safeParse({ operation: "nope" }).success).toBe(false);
    expect(dock.schema.safeParse({ operation: "open_tab", tabId: "browser" }).success).toBe(true);
    expect(dock.schema.safeParse({ operation: "open_tab" }).success).toBe(false);
  });

  it("switches catalog on AGENT_SURFACE only", () => {
    delete process.env.AGENT_SURFACE;
    expect(getToolsForSurface()).toBe(defaultTools);
    process.env.AGENT_SURFACE = "minimal";
    const tools = getToolsForSurface();
    expect(tools.map((t) => t.name).sort()).toEqual([...MINIMAL_NAMES].sort());
    process.env.AGENT_SURFACE = "full";
    expect(getToolsForSurface()).toBe(defaultTools);
  });

  it("denies create/delete at meta granularity for fix/update intents", () => {
    expect(MINIMAL_WHOLE_DENYLIST.theme).toEqual(
      expect.arrayContaining(["web", "map", "dock", "plugins", "fs"])
    );
    expect(MINIMAL_ACTION_DENYLIST.plugin_update).toEqual({
      dock: ["create_tab"],
      plugins: ["create_plugin"],
    });
    expect(MINIMAL_ACTION_DENYLIST.plugin_fix).toEqual({
      dock: ["create_tab", "delete_tab"],
      plugins: ["create_plugin"],
    });
    expect(MINIMAL_ACTION_DENYLIST.general).toEqual({});
  });
});
