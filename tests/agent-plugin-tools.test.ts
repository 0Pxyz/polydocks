import { describe, it, expect, beforeEach } from "bun:test";
import { create_plugin } from "../server/agent/tools/create_plugin";
import { modify_plugin } from "../server/agent/tools/modify_plugin";
import { operate_plugin } from "../server/agent/tools/operate_plugin";
import { isPluginSynthesisIntent, loadSkill } from "../server/agent/skills";
import { PluginRegistry } from "../server/plugins/registry";
import { listWorkspacePlugins, ensureDefaultWorkspace } from "../server/workspace/workspaces";
import { capabilityBus } from "../server/plugins/bus";
import { db } from "../server/workspace/db";

describe("PolyDocks V2 Agent Plugin Synthesis & Operations", () => {
  beforeEach(() => {
    ensureDefaultWorkspace();
    // Clean up test plugins
    db.query("DELETE FROM workspace_plugins WHERE plugin_id LIKE 'test-%'").run();
    db.query("DELETE FROM plugins WHERE id LIKE 'test-%'").run();
  });

  describe("Intent Detection (isPluginSynthesisIntent)", () => {
    it("detects plugin & tool creation requests across languages", () => {
      expect(isPluginSynthesisIntent("Build a Pomodoro timer with customizable focus & break sessions")).toBe(true);
      expect(isPluginSynthesisIntent("Create a kanban board tool for tracking daily goals")).toBe(true);
      expect(isPluginSynthesisIntent("Crie um cronômetro na dock")).toBe(true);
      expect(isPluginSynthesisIntent("build a plugin for currency conversion")).toBe(true);
      expect(isPluginSynthesisIntent("Modify plugin pomodoro-timer to add streak counter")).toBe(true);
    });

    it("does NOT trigger plugin synthesis for general knowledge or chat queries", () => {
      expect(isPluginSynthesisIntent("What is quantum teleportation?")).toBe(false);
      expect(isPluginSynthesisIntent("How does backpropagation work in neural networks?")).toBe(false);
      expect(isPluginSynthesisIntent("Explain the difference between Plato and Aristotle")).toBe(false);
      expect(isPluginSynthesisIntent("O que é computação quântica?")).toBe(false);
    });

    it("loads synthesize-plugin.md skill successfully", async () => {
      const skill = await loadSkill("synthesize-plugin");
      expect(skill).toContain("Synthesize & Modify PolyDocks Plugins");
      expect(skill).toContain("window.polydocks.storage");
      expect(skill).toContain("--accent: #C8FF57");
    });
  });

  describe("create_plugin Tool", () => {
    it("synthesizes, registers, and mounts a new plugin into workspace", async () => {
      const sampleCode = `
        const app = document.getElementById('app');
        app.innerHTML = '<div id="counter">0</div>';
        window.polydocks.storage.get('count').then(val => {
          if (val) document.getElementById('counter').innerText = val;
        });
      `;

      const result = await create_plugin.execute(
        {
          id: "test-counter-tool",
          name: "Counter Utility",
          description: "A simple persistent counter micro-app",
          icon: "Plus",
          code: sampleCode,
          workspaceId: "default",
          capabilities: [
            {
              id: "increment",
              title: "Increment Counter",
              description: "Increments count by 1",
            },
          ],
        },
        { cityId: "default" }
      );

      expect(result.success).toBe(true);
      expect(result.pluginId).toBe("test-counter-tool");
      expect(result.action).toBe("dock.tool_mounted");

      // Verify registered in PluginRegistry
      const registry = PluginRegistry.getInstance();
      const plugin = registry.get("test-counter-tool");
      expect(plugin).not.toBeNull();
      expect(plugin?.name).toBe("Counter Utility");
      expect(plugin?.version).toBe("1.0.0");

      // Verify mounted in workspace dock
      const mountedList = listWorkspacePlugins("default");
      expect(mountedList.some((p) => p.pluginId === "test-counter-tool")).toBe(true);
    });

    it("strictly blocks guest code containing forbidden external imports", async () => {
      const maliciousCode = `
        import fs from "node:fs";
        console.log("pwned", fs);
      `;

      const result = (await create_plugin.execute(
        {
          id: "test-unsafe-tool",
          name: "Unsafe Tool",
          description: "Violates sandbox boundaries",
          code: maliciousCode,
        },
        { cityId: "default" }
      )) as any;
      expect(result.success).toBe(false);
      expect(result.error).toContain("is not allowed in plugin code");
      expect(PluginRegistry.getInstance().get("test-unsafe-tool")).toBeNull();
    });
  });

  describe("modify_plugin Tool", () => {
    it("updates existing plugin in-place, increments version, and preserves identity", async () => {
      const initialCode = `
        const app = document.getElementById('app');
        app.innerHTML = '<h1>V1</h1>';
      `;

      // 1. Create initial plugin
      await create_plugin.execute(
        {
          id: "test-in-place-tool",
          name: "Original Tool",
          description: "Version 1 description",
          code: initialCode,
        },
        { cityId: "default" }
      );

      // 2. Modify plugin in-place
      const updatedCode = `
        const app = document.getElementById('app');
        app.innerHTML = '<h1>V2 Updated</h1>';
        window.polydocks.storage.set('theme', 'lime');
      `;

      const modResult = await modify_plugin.execute(
        {
          id: "test-in-place-tool",
          name: "Original Tool Enhanced",
          code: updatedCode,
          changeSummary: "Added lime theme and updated UI heading",
        },
        { cityId: "default" }
      );

      expect(modResult.success).toBe(true);
      expect(modResult.version).toBe("1.0.1");
      expect(modResult.action).toBe("dock.tool_updated");

      // Verify registry updated without duplicating
      const registry = PluginRegistry.getInstance();
      const plugin = registry.get("test-in-place-tool");
      expect(plugin?.version).toBe("1.0.1");
      expect(plugin?.name).toBe("Original Tool Enhanced");

      // Verify still only 1 entry in workspace
      const mounted = listWorkspacePlugins("default").filter(
        (p) => p.pluginId === "test-in-place-tool"
      );
      expect(mounted.length).toBe(1);
    });
  });

  describe("operate_plugin Tool", () => {
    it("invokes an exposed capability on behalf of the user", async () => {
      // Register test capability directly on capabilityBus
      capabilityBus.register(
        "test-calc",
        {
          id: "test-calc.add",
          title: "Add Numbers",
          description: "Adds two numbers",
          risk: "read",
          input: {
            type: "object",
            properties: {
              a: { type: "number" },
              b: { type: "number" },
            },
            required: ["a", "b"],
          },
        },
        async (input: any) => {
          return { sum: Number(input.a) + Number(input.b) };
        }
      );

      const res = await operate_plugin.execute(
        {
          pluginId: "test-calc",
          action: "add",
          args: { a: 15, b: 27 },
        },
        { cityId: "default" }
      );

      expect(res.success).toBe(true);
      expect(res.data).toEqual({ sum: 42 });
    });
  });
});
