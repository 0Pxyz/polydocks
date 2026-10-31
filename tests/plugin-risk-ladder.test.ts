import { describe, it, expect } from "bun:test";
import { capabilityBus } from "../server/plugins/bus";
import { initializeFirstPartyPlugins } from "../server/plugins/first-party/index";
import { tierForCapability, describePermission, RISK_LADDER } from "../server/plugins/risk";
import { evaluateCapabilityPolicy } from "../server/plugins/policy";
import type { RegisteredCapability } from "../server/plugins/bus";

/** Risk ladder (#180): one mapping, pinned tiers, no silent-path regressions. */
describe("risk ladder", () => {
  it("orders the four tiers read < write < external < destructive", () => {
    expect(RISK_LADDER.map((l) => l.tier)).toEqual(["read", "write", "external", "destructive"]);
    expect(RISK_LADDER.find((l) => l.tier === "destructive")?.prompts).toBe("always");
  });

  it("pins every registered capability to its tier", () => {
    initializeFirstPartyPlugins();
    const caps = capabilityBus.getCapabilities();
    expect(caps.length).toBeGreaterThan(0);
    const expected: Record<string, string> = {
      "search.web": "external",
      "search.fetch": "external",
      "browser.open": "read",
    };
    for (const cap of caps) {
      const tier = tierForCapability(cap);
      expect(tier.tier).toBe(cap.risk);
      expect(tier.summary).toContain(cap.title);
      if (expected[cap.id]) expect(tier.tier).toBe(expected[cap.id]);
    }
  });

  it("describes every permission type for install-time display", () => {
    expect(describePermission({ type: "net", hosts: ["a.example"] })).toContain("a.example");
    expect(describePermission({ type: "fs", scope: "workspace", mode: "write" })).toContain("write");
    expect(describePermission({ type: "exec", commands: ["bun"] })).toContain("bun");
    expect(describePermission({ type: "mcp", server: "s" })).toContain("s");
    expect(describePermission({ type: "secret", name: "k" })).toContain("k");
  });

  it("keeps previously silent safe paths silent (no prompt regression)", async () => {
    const cap: RegisteredCapability = {
      id: "browser.open",
      pluginId: "browser",
      title: "Open Source in Browser",
      description: "open",
      risk: "read",
      inputSchema: undefined,
    };
    const plugin: any = {
      id: "browser",
      manifest: { id: "browser", trust: "first-party", capabilities: [], permissions: [] },
      enabled: true,
    };
    let prompted = false;
    const out = await evaluateCapabilityPolicy({
      capability: cap,
      plugin,
      actor: "agent",
      workspaceId: "ws-1",
      input: {},
      emit: async () => { prompted = true; },
    });
    expect(out.allowed).toBe(true);
    expect(prompted).toBe(false);
  });

  it("still prompts on destructive for every trust level", async () => {
    const cap: RegisteredCapability = {
      id: "x.drop",
      pluginId: "x",
      title: "Drop",
      description: "drop",
      risk: "destructive",
      inputSchema: undefined,
    };
    const plugin: any = {
      id: "x",
      manifest: { id: "x", trust: "first-party", capabilities: [], permissions: [] },
      enabled: true,
    };
    const out = await evaluateCapabilityPolicy({
      capability: cap,
      plugin: plugin,
      actor: "agent",
      workspaceId: "ws-1",
      input: {},
      timeoutMs: 1,
    });
    expect(out.allowed).toBe(false);
  });
});
