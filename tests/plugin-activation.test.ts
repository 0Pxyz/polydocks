import { describe, expect, it } from "bun:test";
import { pluginRegistry } from "../server/plugins/registry";
import { CapabilityBus } from "../server/plugins/bus";
import { buildDynamicCapabilityTools } from "../server/agent/tools/catalog";
import { pluginSetActive } from "../server/facade/shared";

/**
 * Activation acceptance (#153 tasks 1+2+6, agent/catalog half):
 * deactivating closes the plugin in the dock and hides its capabilities
 * from the agent catalog; reactivating brings data back intact.
 */
describe("plugin activation acceptance (#153)", () => {
  const manifest: any = {
    apiVersion: 1,
    id: "test-activation-plugin",
    name: "Activation Probe",
    version: "1.0.0",
    description: "activation acceptance probe",
    icon: "test",
    trust: "first-party",
    capabilities: [
      {
        id: "activationprobe.action",
        title: "Probe action",
        description: "probe capability",
        input: { type: "object", properties: {} },
        risk: "read",
      },
    ],
    permissions: [],
  };

  it("deactivate closes the dock view and hides catalog tools; activate restores", async () => {
    const { openDockItem, getDockItem } = await import("../server/workspace/dockItems");
    expect(pluginRegistry.install(manifest).success).toBe(true);
    const bus = CapabilityBus.getInstance();
    bus.register(
      "test-activation-plugin",
      manifest.capabilities[0],
      async () => ({ probed: true })
    );
    try {
      // Open in the dock while active: visible to the agent catalog.
      openDockItem("test-activation-plugin");
      expect(getDockItem("test-activation-plugin")?.state).toBe("focused");
      expect(buildDynamicCapabilityTools().map((t) => t.name)).toContain("cap.activationprobe.action");

      const off = await pluginSetActive("test-activation-plugin", false, { actor: "user" });
      expect(off.ok).toBe(true);
      // Closed in the dock (state kept, row intact).
      expect(getDockItem("test-activation-plugin")?.state).toBe("closed");
      // Capabilities leave the agent catalog while stored data is kept.
      expect(buildDynamicCapabilityTools().map((t) => t.name)).not.toContain("cap.activationprobe.action");
      expect(pluginRegistry.get("test-activation-plugin")).not.toBeNull();

      const on = await pluginSetActive("test-activation-plugin", true, { actor: "user" });
      expect(on.ok).toBe(true);
      expect((on as any).data).toMatchObject({ pluginId: "test-activation-plugin", active: true, version: "1.0.0" });
      expect(buildDynamicCapabilityTools().map((t) => t.name)).toContain("cap.activationprobe.action");
    } finally {
      bus.unregister("activationprobe.action");
      pluginRegistry.uninstall("test-activation-plugin");
      const { db } = await import("../server/workspace/db");
      db.query("DELETE FROM dock_items WHERE id = ?").run("test-activation-plugin");
    }
  });

  it("refuses unknown plugin ids", async () => {
    const out = await pluginSetActive("no-such-plugin-xyz", false, { actor: "user" });
    expect(out.ok).toBe(false);
  });
});
