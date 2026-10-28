import { describe, it, expect, beforeEach } from "bun:test";
import { create_plugin } from "../server/agent/tools/create_plugin";
import { modify_plugin } from "../server/agent/tools/modify_plugin";
import { publish_plugin } from "../server/agent/tools/publish_plugin";
import {
  ensureDefaultWorkspace,
  createWorkspace,
  listWorkspacePlugins,
} from "../server/workspace/workspaces";
import {
  getRegistryPlugin,
  installFromRegistry,
} from "../server/plugins/communityRegistry";
import { createHostBridge } from "../src/features/dock/bridge/host-bridge";
import { db } from "../server/workspace/db";

class MockLocalStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

describe("PolyDocks V2 End-to-End Pomodoro Benchmark Suite", () => {
  let mockStorage: MockLocalStorage;

  beforeEach(() => {
    mockStorage = new MockLocalStorage();
    (globalThis as any).localStorage = mockStorage;
    ensureDefaultWorkspace();
    // Clean up test records
    db.query("DELETE FROM registry_plugins WHERE id = 'pomodoro-benchmark-test'").run();
    db.query("DELETE FROM workspace_plugins WHERE workspace_id LIKE '%-test' OR plugin_id = 'pomodoro-benchmark-test'").run();
    db.query("DELETE FROM workspaces WHERE id LIKE '%-test'").run();
    db.query("DELETE FROM plugins WHERE id = 'pomodoro-benchmark-test'").run();
  });

  it("completes full lifecycle: create -> use storage -> in-place modify -> publish -> cross-workspace install", async () => {
    // -------------------------------------------------------------
    // STEP 1: User enters workspace "Focus Hub"
    // -------------------------------------------------------------
    const primaryWs = createWorkspace({
      id: "focus-hub-test",
      name: "Focus Hub",
      description: "Primary workspace for daily deep work",
      icon: "Brain",
    });
    expect(primaryWs.id).toBe("focus-hub-test");

    // -------------------------------------------------------------
    // STEP 2: Agent synthesizes and mounts Pomodoro Focus tool
    // -------------------------------------------------------------
    const initialPomodoroCode = `
      const app = document.getElementById('app');
      app.innerHTML = '<div id="timer">25:00</div><button id="start">Start</button>';
      document.getElementById('start').addEventListener('click', () => {
        const sessions = [{ id: 1, duration: 25, completedAt: Date.now() }];
        window.polydocks.storage.set('sessions', sessions);
      });
    `;

    const createResult = await create_plugin.execute(
      {
        id: "pomodoro-benchmark-test",
        name: "Pomodoro Benchmark Timer",
        description: "Tactile Pomodoro timer with customizable focus & break sessions",
        icon: "Clock",
        code: initialPomodoroCode,
        workspaceId: "focus-hub-test",
      },
      { cityId: "focus-hub-test" }
    );

    expect(createResult.success).toBe(true);
    expect(createResult.action).toBe("dock.tool_mounted");
    expect(createResult.version).toBe("1.0.0");

    // Dock verification: plugin is mounted in focus-hub-test
    const initialPlugins = listWorkspacePlugins("focus-hub-test");
    expect(initialPlugins.some((p) => p.pluginId === "pomodoro-benchmark-test")).toBe(true);

    // -------------------------------------------------------------
    // STEP 3: User runs a session in the plugin, persisting state
    // -------------------------------------------------------------
    let bridgeResponse: any = null;
    const mockGuestWindow = {
      postMessage: (msg: any) => {
        bridgeResponse = msg;
      },
    } as unknown as Window;

    const bridge = createHostBridge(mockGuestWindow, {
      cityId: "focus-hub-test",
      tabId: "pomodoro-benchmark-test",
      workspaceId: "focus-hub-test",
      pluginId: "pomodoro-benchmark-test",
      storagePrefix: "polydocks",
    });

    const sessionData = [
      { id: 1, duration: 25, mode: "work", completedAt: 1710000000000 },
      { id: 2, duration: 5, mode: "break", completedAt: 1710001800000 },
    ];

    await bridge.handleMessage({
      source: mockGuestWindow,
      data: {
        polymaxAction: "storage.set",
        polymaxRequestId: 201,
        key: "pomodoro_sessions",
        value: sessionData,
      },
    } as MessageEvent);

    expect(bridgeResponse.polymaxResponseId).toBe(201);
    expect(bridgeResponse.result).toBe(true);

    // -------------------------------------------------------------
    // STEP 4: User requests refinement: "Add streak tracker and change theme"
    // -------------------------------------------------------------
    const updatedPomodoroCode = `
      const app = document.getElementById('app');
      app.innerHTML = '<div id="timer">25:00</div><div id="streak">🔥 Streak: 2 days</div>';
    `;

    const modifyResult = await modify_plugin.execute(
      {
        id: "pomodoro-benchmark-test",
        code: updatedPomodoroCode,
        changeSummary: "Added streak counter and updated UI layout",
        workspaceId: "focus-hub-test",
      },
      { cityId: "focus-hub-test" }
    );

    expect(modifyResult.success).toBe(true);
    expect(modifyResult.action).toBe("dock.tool_updated");
    expect(modifyResult.version).toBe("1.0.1");

    // Dock verification: Still exactly ONE entry in dock (no duplicates)
    const afterUpdatePlugins = listWorkspacePlugins("focus-hub-test").filter(
      (p) => p.pluginId === "pomodoro-benchmark-test"
    );
    expect(afterUpdatePlugins.length).toBe(1);

    // State verification: Storage from Step 3 is preserved
    await bridge.handleMessage({
      source: mockGuestWindow,
      data: {
        polymaxAction: "storage.get",
        polymaxRequestId: 202,
        key: "pomodoro_sessions",
      },
    } as MessageEvent);

    expect(bridgeResponse.polymaxResponseId).toBe(202);
    expect(bridgeResponse.result).toEqual(sessionData);

    bridge.destroy();

    // -------------------------------------------------------------
    // STEP 5: User publishes plugin to Community Store
    // -------------------------------------------------------------
    const pubResult = await publish_plugin.execute(
      {
        pluginId: "pomodoro-benchmark-test",
        workspaceId: "focus-hub-test",
        author: "Gabriel (PolyDocks Creator)",
        tags: ["productivity", "timer", "focus"],
      },
      { cityId: "focus-hub-test" }
    );

    expect(pubResult.success).toBe(true);

    const storeEntry = getRegistryPlugin("pomodoro-benchmark-test");
    expect(storeEntry).not.toBeNull();
    expect(storeEntry?.name).toBe("Pomodoro Benchmark Timer");
    expect(storeEntry?.tags).toContain("focus");

    // -------------------------------------------------------------
    // STEP 6: Another workspace installs the tool with 1-click
    // -------------------------------------------------------------
    const secondWs = createWorkspace({
      id: "deep-learning-lab-test",
      name: "Deep Learning Lab",
    });
    expect(secondWs.id).toBe("deep-learning-lab-test");

    const installRes = await installFromRegistry(
      "pomodoro-benchmark-test",
      "deep-learning-lab-test"
    );
    expect(installRes.success).toBe(true);

    // Verify mounted into second workspace dock
    const secondWsPlugins = listWorkspacePlugins("deep-learning-lab-test");
    expect(secondWsPlugins.some((p) => p.pluginId === "pomodoro-benchmark-test")).toBe(true);
  });
});
