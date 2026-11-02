import { describe, it, expect, beforeEach } from "bun:test";
import { createHostBridge } from "../src/features/dock/bridge/host-bridge";
import { GUEST_BRIDGE_SCRIPT } from "../src/features/dock/bridge/guest-bridge";
import { ensureDefaultWorkspace, createWorkspace } from "../server/workspace/workspaces";
import { create_plugin } from "../server/agent/tools/create_plugin";
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

describe("PolyDocks V2 Sandboxed Plugin Runtime & Host Bridge", () => {
  let mockStorage: MockLocalStorage;

  beforeEach(() => {
    mockStorage = new MockLocalStorage();
    (globalThis as any).localStorage = mockStorage;
    ensureDefaultWorkspace();
    db.query("DELETE FROM workspace_plugins WHERE plugin_id LIKE 'test-%'").run();
    db.query("DELETE FROM workspace_plugins WHERE workspace_id LIKE 'test-%'").run();
    db.query("DELETE FROM workspaces WHERE id LIKE 'test-%'").run();
    db.query("DELETE FROM plugins WHERE id LIKE 'test-%'").run();
    db.query("DELETE FROM plugin_files WHERE plugin_id LIKE 'test-%'").run();
    db.query("DELETE FROM plugin_files WHERE workspace_id LIKE 'test-%'").run();
  });

  it("exports valid guest bridge script exposing window.polydocks with theme and storage", () => {
    expect(GUEST_BRIDGE_SCRIPT).toContain("window.polymax = {");
    expect(GUEST_BRIDGE_SCRIPT).toContain("window.polydocks = window.polymax;");
    expect(GUEST_BRIDGE_SCRIPT).toContain("invokeAction:");
    expect(GUEST_BRIDGE_SCRIPT).toContain("theme: {");
    expect(GUEST_BRIDGE_SCRIPT).toContain("accent: '#C8FF57'");
  });

  it("mediates storage scoped to workspace_id and plugin_id with polydocks prefix", async () => {
    let sentResponse: any = null;
    const mockWindow = {
      postMessage: (data: any) => {
        sentResponse = data;
      },
    } as unknown as Window;

    const bridge = createHostBridge(mockWindow, {
      workspaceId: "ws-focus",
      tabId: "pomodoro-tool",
      pluginId: "pomodoro-tool",
      storagePrefix: "polydocks",
    });

    // 1. Test storage.set
    await bridge.handleMessage({
      source: mockWindow,
      data: {
        polymaxAction: "storage.set",
        polymaxRequestId: 101,
        key: "pomodoro_history",
        value: [{ session: 1, duration: 25 }],
      },
    } as MessageEvent);

    expect(sentResponse).not.toBeNull();
    expect(sentResponse.polymaxResponseId).toBe(101);
    expect(sentResponse.result).toBe(true);

    // Verify localStorage key format
    const expectedKey = "polydocks:ws-focus:pomodoro-tool:pomodoro_history";
    const rawSaved = localStorage.getItem(expectedKey);
    expect(rawSaved).not.toBeNull();
    expect(JSON.parse(rawSaved!)).toEqual([{ session: 1, duration: 25 }]);

    // 2. Test storage.get
    await bridge.handleMessage({
      source: mockWindow,
      data: {
        polymaxAction: "storage.get",
        polymaxRequestId: 102,
        key: "pomodoro_history",
      },
    } as MessageEvent);

    expect(sentResponse.polymaxResponseId).toBe(102);
    expect(sentResponse.result).toEqual([{ session: 1, duration: 25 }]);

    // 3. Test getContext returns workspaceId and pluginId
    await bridge.handleMessage({
      source: mockWindow,
      data: {
        polymaxAction: "getContext",
        polymaxRequestId: 103,
      },
    } as MessageEvent);

    expect(sentResponse.polymaxResponseId).toBe(103);
    expect(sentResponse.result.workspaceId).toBe("ws-focus");
    expect(sentResponse.result.pluginId).toBe("pomodoro-tool");

    bridge.destroy();
  });

  it("serves compiled srcdoc from /api/workspaces/:id/plugins/:pluginId/srcdoc", async () => {
    const { default: app } = await import("../server/index");

    createWorkspace({
      id: "test-runtime-ws",
      name: "Runtime Workspace",
    });

    const code = `
      const app = document.getElementById('app');
      app.innerHTML = '<h1>Timer Active</h1>';
    `;

    await create_plugin.execute(
      {
        id: "test-timer-runtime",
        name: "Runtime Timer",
        description: "Testing runtime endpoint",
        code,
        workspaceId: "test-runtime-ws",
      },
      { workspaceId: "test-runtime-ws" }
    );

    const res = await app.fetch(
      new Request(
        "http://localhost:3000/api/workspaces/test-runtime-ws/plugins/test-timer-runtime/srcdoc"
      )
    );

    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("Timer Active");
    expect(html).toContain("window.polydocks = window.polymax;");
    // Shared app tokens (including every theme override), not a forked palette.
    expect(html).toContain('[data-theme="cyber"]');
    expect(html).toContain("--bg: var(--background)");
  });
});
