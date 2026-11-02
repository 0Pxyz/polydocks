import { describe, expect, it } from "bun:test";
import { CapabilityBus } from "../server/plugins/bus";
import { fullTools, generatedCatalogSnapshot, buildDynamicCapabilityTools, capabilityToolName } from "../server/agent/tools/index";

describe("derived tool catalog from capability registry", () => {
  it("exposes a newly registered capability with no catalog file edit", () => {
    const bus = CapabilityBus.getInstance();
    const before = buildDynamicCapabilityTools().map((t) => t.name);
    bus.register("eval-probe-plugin", {
      id: "eval.probe",
      title: "Eval probe",
      description: "probe capability for catalog test",
      risk: "read",
      input: { type: "object", properties: {} },
    } as any, async () => ({ probed: true }));
    try {
      const after = buildDynamicCapabilityTools().map((t) => t.name);
      expect(after).toContain(capabilityToolName("eval.probe"));
      expect(after.length).toBeGreaterThanOrEqual(before.length);
    } finally {
      bus.unregister("eval.probe");
    }
  });

  it("generated snapshot keeps every current static tool (no regression)", () => {
    const snap = generatedCatalogSnapshot(fullTools.map((t) => t.name));
    expect(snap.static).toContain("find_capabilities");
    expect(snap.static).toContain("create_plugin");
    expect(snap.static).toEqual([...fullTools.map((t) => t.name)].sort());
  });
});
