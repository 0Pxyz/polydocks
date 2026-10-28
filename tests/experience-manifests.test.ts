import { describe, it, expect, beforeEach, afterEach } from "vitest";
import app from "../server/index";
import { create_tab } from "../server/agent/tools/create_tab";
import { inspect_experience } from "../server/agent/tools/inspect_experience";
import { promote_to_plugin } from "../server/agent/tools/promote_to_plugin";
import { pluginRegistry } from "../server/plugins/registry";
import { capabilityBus } from "../server/plugins/bus";
import {
  recordExperienceError,
  getExperienceErrors,
  clearExperienceErrors,
} from "../server/workspace/experienceErrors";
import { createHostBridge } from "../src/features/dock/bridge/host-bridge";
import { buildFeatureSrcdoc } from "../server/workspace/features";
import { db } from "../server/workspace/db";
import { z } from "zod";

describe("Experience Manifests, Error Reporting & promote_to_plugin (Issue #49)", () => {
  const testCity = "city_exp_test";
  const testExpId = "exp_flashcards";

  beforeEach(() => {
    clearExperienceErrors();
    db.query("DELETE FROM plugins WHERE id LIKE 'gen_%'").run();
    db.query("DELETE FROM plugin_grants WHERE plugin_id LIKE 'gen_%'").run();
  });

  afterEach(() => {
    clearExperienceErrors();
    db.query("DELETE FROM plugins WHERE id LIKE 'gen_%'").run();
    db.query("DELETE FROM plugin_grants WHERE plugin_id LIKE 'gen_%'").run();
  });

  describe("Experience Synthesis with Manifest & Capabilities", () => {
    it("creates a dynamic experience with declared capabilities and permissions", async () => {
      const code = `
        const root = document.getElementById('app');
        root.innerHTML = '<h1>Stoic Flashcards</h1>';
        window.polymax.storage.set('count', 1);
      `;

      const result = (await create_tab.execute(
        {
          id: testExpId,
          title: "Stoic Flashcards",
          icon: "Cards",
          code,
          capabilities: ["search.web", "writing.read_file"],
          permissions: [{ type: "fs", scope: "city", mode: "read" }],
          cityId: testCity,
        },
        { cityId: testCity, step: 1 }
      )) as any;

      expect(result.success).toBe(true);
      expect(result.tab.id).toBe(testExpId);
      expect(result.tab.capabilities).toEqual(["search.web", "writing.read_file"]);
      expect(result.tab.permissions.length).toBe(1);
    });

    it("injects runtime error listener and window.polymax.invoke into generated srcdoc", () => {
      const srcdoc = buildFeatureSrcdoc("console.log('hi');", {
        id: "test_doc",
        title: "Test Doc",
      });

      expect(srcdoc).toContain("polymaxAction: 'runtime.error'");
      expect(srcdoc).toContain("invoke: (capabilityId, input)");
      expect(srcdoc).toContain("window.polymax = {");
    });
  });

  describe("Guest Error Reporting & Error Collection", () => {
    it("records and retrieves runtime errors via SQLite collector", () => {
      const recorded = recordExperienceError(testExpId, testCity, {
        message: "ReferenceError: foo is not defined",
        filename: "index.ts",
        lineno: 42,
        colno: 10,
        stack: "ReferenceError: foo is not defined\n  at index.ts:42:10",
      });

      expect(recorded.id).toBeDefined();
      expect(recorded.message).toBe("ReferenceError: foo is not defined");

      const errors = getExperienceErrors(testExpId, testCity);
      expect(errors.length).toBe(1);
      expect(errors[0].lineno).toBe(42);
      expect(errors[0].message).toContain("ReferenceError");
    });

    it("captures guest errors via REST endpoint POST /api/experiences/:id/errors", async () => {
      const res = await app.fetch(
        new Request(`http://localhost:3000/api/experiences/${testExpId}/errors`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cityId: testCity,
            error: {
              message: "TypeError: Cannot read properties of undefined",
              lineno: 12,
            },
          }),
        })
      );

      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.success).toBe(true);
      expect(data.error.message).toBe("TypeError: Cannot read properties of undefined");

      const listRes = await app.fetch(
        new Request(`http://localhost:3000/api/experiences/${testExpId}/errors?cityId=${testCity}`)
      );
      expect(listRes.status).toBe(200);
      const listData = (await listRes.json()) as any;
      expect(listData.errors.length).toBeGreaterThan(0);
      expect(listData.errors[0].message).toContain("TypeError");
    });
  });

  describe("Host Bridge Capability Invocation & Permission Boundary", () => {
    it("invokes declared capability successfully via host bridge", async () => {
      capabilityBus.register("bridge_test", {
        id: "bridge_test.greet",
        title: "Greet",
        description: "Greets user",
        risk: "read",
        input: z.object({ name: z.string() }),
      }, async (input) => ({ reply: `Hello, ${input.name}!` }));

      let bridgeResponse: any = null;
      const fakeWindow = {
        postMessage: (data: any) => {
          bridgeResponse = data;
        },
      } as unknown as Window;

      const bridge = createHostBridge(fakeWindow, {
        cityId: testCity,
        tabId: testExpId,
        allowedCapabilities: ["bridge_test.greet"],
        onInvoke: async (capId, input) => {
          const res = await capabilityBus.invoke(capId, input, { actor: "user" });
          return res.data;
        },
      });

      // Guest sends capability.invoke
      await bridge.handleMessage({
        source: fakeWindow,
        data: {
          polymaxAction: "capability.invoke",
          polymaxRequestId: 99,
          capabilityId: "bridge_test.greet",
          input: { name: "Marcus" },
        },
      } as MessageEvent);

      expect(bridgeResponse).not.toBeNull();
      expect(bridgeResponse.polymaxResponseId).toBe(99);
      expect(bridgeResponse.result).toEqual({ reply: "Hello, Marcus!" });
      expect(bridgeResponse.error).toBeUndefined();
    });

    it("strictly rejects undeclared capabilities in host bridge", async () => {
      let bridgeResponse: any = null;
      const fakeWindow = {
        postMessage: (data: any) => {
          bridgeResponse = data;
        },
      } as unknown as Window;

      const bridge = createHostBridge(fakeWindow, {
        cityId: testCity,
        tabId: testExpId,
        allowedCapabilities: ["search.web"], // only search.web is declared!
      });

      // Guest attempts to invoke undeclared writing.write_file
      await bridge.handleMessage({
        source: fakeWindow,
        data: {
          polymaxAction: "capability.invoke",
          polymaxRequestId: 101,
          capabilityId: "writing.write_file",
          input: { path: "hack.txt", content: "evil" },
        },
      } as MessageEvent);

      expect(bridgeResponse).not.toBeNull();
      expect(bridgeResponse.polymaxResponseId).toBe(101);
      expect(bridgeResponse.error).toContain("Permission denied: Capability \"writing.write_file\" is not declared");
    });
  });

  describe("inspect_experience & promote_to_plugin Agent Tools", () => {
    it("inspect_experience returns health, payload size, declared capabilities, and errors", async () => {
      // First create experience
      await create_tab.execute(
        {
          id: "exp_inspector_test",
          title: "Inspector Test",
          code: "console.log('inspect me');",
          capabilities: ["search.web"],
          cityId: testCity,
        },
        { cityId: testCity, step: 1 }
      );

      // Record a test error
      recordExperienceError("exp_inspector_test", testCity, {
        message: "Simulated runtime crash",
      });

      const inspectRes = (await inspect_experience.execute(
        { id: "exp_inspector_test", cityId: testCity },
        { cityId: testCity, step: 2 }
      )) as any;

      expect(inspectRes.success).toBe(true);
      expect(inspectRes.experience.id).toBe("exp_inspector_test");
      expect(inspectRes.experience.title).toBe("Inspector Test");
      expect(inspectRes.experience.sizeBytes).toBeGreaterThan(0);
      expect(inspectRes.experience.capabilities).toContain("search.web");
      expect(inspectRes.experience.errors.length).toBe(1);
      expect(inspectRes.experience.isHealthy).toBe(false);
    });

    it("promote_to_plugin promotes a verified experience into a reusable plugin", async () => {
      await create_tab.execute(
        {
          id: "exp_stoic_matrix",
          title: "Stoic Decision Matrix",
          icon: "Cards",
          code: "export default {};",
          capabilities: ["search.web"],
          cityId: testCity,
        },
        { cityId: testCity, step: 1 }
      );

      const promoteRes = (await promote_to_plugin.execute(
        {
          id: "exp_stoic_matrix",
          cityId: testCity,
          name: "Stoic Decision Matrix Plugin",
          description: "Reusable Stoic decision matrix",
        },
        { cityId: testCity, step: 2 }
      )) as any;

      expect(promoteRes.success).toBe(true);
      expect(promoteRes.pluginId).toBe("gen_exp_stoic_matrix");
      expect(promoteRes.plugin.trust).toBe("generated");
      expect(promoteRes.manifest.surfaces[0].id).toBe("exp_stoic_matrix");

      // Verify plugin was installed in pluginRegistry
      const installed = pluginRegistry.get("gen_exp_stoic_matrix");
      expect(installed).not.toBeNull();
      expect(installed?.name).toBe("Stoic Decision Matrix Plugin");
      expect(installed?.enabled).toBe(true);

      // Verify it appears in GET /api/plugins
      const pluginRes = await app.fetch(new Request("http://localhost:3000/api/plugins"));
      const pluginData = (await pluginRes.json()) as any;
      const found = pluginData.plugins.find((p: any) => p.id === "gen_exp_stoic_matrix");
      expect(found).toBeDefined();
      expect(found.trust).toBe("generated");
    });
  });
});
