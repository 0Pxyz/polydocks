import { describe, it, expect, beforeEach } from "bun:test";
import { GUEST_BRIDGE_SCRIPT } from "./guest-bridge";
import { createHostBridge } from "./host-bridge";

// In-memory mock localStorage for the test runner
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

// In-memory mock Window for message passing
class MockTargetWindow {
  public receivedMessages: any[] = [];

  postMessage(message: any) {
    this.receivedMessages.push(message);
  }
}

describe("Dock Plugin Bridge Runtime & Sandbox Protocol", () => {
  let mockStorage: MockLocalStorage;

  beforeEach(() => {
    mockStorage = new MockLocalStorage();
    (globalThis as any).localStorage = mockStorage;
  });

  it("exports valid guest bridge script exposing window.polymax", () => {
    expect(GUEST_BRIDGE_SCRIPT).toContain("window.polymax =");
    expect(GUEST_BRIDGE_SCRIPT).toContain("storage:");
    expect(GUEST_BRIDGE_SCRIPT).toContain("openUrl:");
    expect(GUEST_BRIDGE_SCRIPT).toContain("openContent:");
    expect(GUEST_BRIDGE_SCRIPT).toContain("useCapability:");
    expect(GUEST_BRIDGE_SCRIPT).toContain("getContext:");
    expect(GUEST_BRIDGE_SCRIPT).toContain("task:");
    expect(GUEST_BRIDGE_SCRIPT).toContain("ui:");
    expect(GUEST_BRIDGE_SCRIPT).toContain("expand:");
    expect(GUEST_BRIDGE_SCRIPT).toContain("collapse:");
  });

  it("routes openContent to the native Reader and falls back to onOpenUrl", async () => {
    const targetWin = new MockTargetWindow() as any;
    let readerUrl = "";
    const bridge = createHostBridge(targetWin, {
      workspaceId: "workspace-1",
      tabId: "tab-1",
      onOpenContent: (url) => {
        readerUrl = url;
      },
    });

    await bridge.handleMessage({
      source: targetWin,
      data: {
        polymaxAction: "openContent",
        polymaxRequestId: 701,
        url: "https://example.com/article",
      },
    } as any);

    expect(readerUrl).toBe("https://example.com/article");
    expect(targetWin.receivedMessages[0].result).toBe(true);

    // Forbidden scheme is rejected.
    await bridge.handleMessage({
      source: targetWin,
      data: {
        polymaxAction: "openContent",
        polymaxRequestId: 702,
        url: "javascript:alert(1)",
      },
    } as any);
    expect(targetWin.receivedMessages[1].error).toContain("Forbidden URL protocol");

    // Without onOpenContent, falls back to onOpenUrl (legacy Browser path).
    const fallbackWin = new MockTargetWindow() as any;
    let openedUrl = "";
    const fallback = createHostBridge(fallbackWin, {
      workspaceId: "workspace-1",
      tabId: "tab-1",
      onOpenUrl: (url) => {
        openedUrl = url;
      },
    });
    await fallback.handleMessage({
      source: fallbackWin,
      data: {
        polymaxAction: "openContent",
        polymaxRequestId: 703,
        url: "https://example.com/video",
      },
    } as any);
    expect(openedUrl).toBe("https://example.com/video");
  });

  it("persists data with strict per-workspace and per-tab isolation", async () => {
    const targetWin1 = new MockTargetWindow() as any;
    const targetWin2 = new MockTargetWindow() as any;

    const bridge1 = createHostBridge(targetWin1, { workspaceId: "workspace-alpha", tabId: "flashcards" });
    const bridge2 = createHostBridge(targetWin2, { workspaceId: "workspace-beta", tabId: "flashcards" });

    // 1. Tab 1 sets a value in workspace-alpha
    await bridge1.handleMessage({
      source: targetWin1,
      data: {
        polymaxAction: "storage.set",
        polymaxRequestId: 101,
        key: "score",
        value: 42,
      },
    } as any);

    expect(targetWin1.receivedMessages[0]).toEqual({
      polymaxResponseId: 101,
      result: true,
      error: undefined,
    });

    // 2. Tab 1 reads back value
    await bridge1.handleMessage({
      source: targetWin1,
      data: {
        polymaxAction: "storage.get",
        polymaxRequestId: 102,
        key: "score",
      },
    } as any);

    expect(targetWin1.receivedMessages[1]).toEqual({
      polymaxResponseId: 102,
      result: 42,
      error: undefined,
    });

    // 3. Tab 2 in workspace-beta reads 'score' — must be null (isolated!)
    await bridge2.handleMessage({
      source: targetWin2,
      data: {
        polymaxAction: "storage.get",
        polymaxRequestId: 201,
        key: "score",
      },
    } as any);

    expect(targetWin2.receivedMessages[0]).toEqual({
      polymaxResponseId: 201,
      result: null,
      error: undefined,
    });
  });

  it("provides contextual workspace data through getContext", async () => {
    const targetWin = new MockTargetWindow() as any;
    const bridge = createHostBridge(targetWin, {
      workspaceId: "athens-stoicism",
      tabId: "matrix",
      getContext: () => ({ topic: "Stoic Philosophy", notesCount: 5 }),
    });

    await bridge.handleMessage({
      source: targetWin,
      data: {
        polymaxAction: "getContext",
        polymaxRequestId: 301,
      },
    } as any);

    const res = targetWin.receivedMessages[0];
    expect(res.polymaxResponseId).toBe(301);
    expect(res.result.workspaceId).toBe("athens-stoicism");
    expect(res.result.tabId).toBe("matrix");
    expect(res.result.topic).toBe("Stoic Philosophy");
    expect(res.result.notesCount).toBe(5);
  });

  it("handles openUrl safely and blocks forbidden schemes", async () => {
    const targetWin = new MockTargetWindow() as any;
    let openedUrl = "";
    const bridge = createHostBridge(targetWin, {
      workspaceId: "workspace-1",
      tabId: "tab-1",
      onOpenUrl: (url) => {
        openedUrl = url;
      },
    });

    // Valid HTTPS url
    await bridge.handleMessage({
      source: targetWin,
      data: {
        polymaxAction: "openUrl",
        polymaxRequestId: 401,
        url: "https://arxiv.org/abs/2301.12345",
      },
    } as any);

    expect(openedUrl).toBe("https://arxiv.org/abs/2301.12345");
    expect(targetWin.receivedMessages[0].result).toBe(true);

    // Dangerous javascript: scheme
    await bridge.handleMessage({
      source: targetWin,
      data: {
        polymaxAction: "openUrl",
        polymaxRequestId: 402,
        url: "javascript:alert(1)",
      },
    } as any);

    expect(targetWin.receivedMessages[1].error).toContain("Forbidden URL protocol");
  });

  it("dispatches expansion and command submissions", async () => {
    const targetWin = new MockTargetWindow() as any;
    let expanded = false;
    let submittedCmd = "";

    const bridge = createHostBridge(targetWin, {
      workspaceId: "workspace-1",
      tabId: "tab-1",
      onExpand: () => {
        expanded = true;
      },
      onSubmitCommand: (cmd) => {
        submittedCmd = cmd;
      },
    });

    // ui.expand
    await bridge.handleMessage({
      source: targetWin,
      data: {
        polymaxAction: "ui.expand",
        polymaxRequestId: 501,
      },
    } as any);

    expect(expanded).toBe(true);

    // submit command
    await bridge.handleMessage({
      source: targetWin,
      data: {
        polymaxAction: "submit",
        polymaxRequestId: 502,
        command: "synthesize practice drill",
      },
    } as any);

    expect(submittedCmd).toBe("synthesize practice drill");
  });

  it("registers background tasks with the host runtime (never tied to the component)", async () => {
    const targetWin = new MockTargetWindow() as any;
    const events: any[] = [];
    const bridge = createHostBridge(targetWin, {
      workspaceId: "workspace-1",
      tabId: "tab-1",
      onTaskEvent: (e) => {
        events.push(e);
      },
    });

    // task.start requires a label and resolves with a host id.
    await bridge.handleMessage({
      source: targetWin,
      data: { polymaxAction: "task.start", polymaxRequestId: 801 },
    } as any);
    expect(targetWin.receivedMessages[0].error).toContain("requires a label");

    await bridge.handleMessage({
      source: targetWin,
      data: { polymaxAction: "task.start", polymaxRequestId: 802, label: "Export CSV" },
    } as any);
    expect(targetWin.receivedMessages[1].result.id).toBeTruthy();
    expect(events[0]).toMatchObject({ type: "start", tabId: "tab-1", label: "Export CSV" });
    const taskId = targetWin.receivedMessages[1].result.id as string;

    // task.update / task.done route by id; missing ids are rejected.
    await bridge.handleMessage({
      source: targetWin,
      data: { polymaxAction: "task.update", polymaxRequestId: 803 },
    } as any);
    expect(targetWin.receivedMessages[2].error).toContain("requires a taskId");

    await bridge.handleMessage({
      source: targetWin,
      data: { polymaxAction: "task.update", polymaxRequestId: 804, taskId, status: "running", detail: "50%" },
    } as any);
    expect(targetWin.receivedMessages[3].result).toBe(true);
    expect(events[1]).toMatchObject({ type: "update", taskId, status: "running" });

    await bridge.handleMessage({
      source: targetWin,
      data: { polymaxAction: "task.done", polymaxRequestId: 805, taskId },
    } as any);
    expect(events[2]).toMatchObject({ type: "done", taskId, status: "done" });
  });

  it("ignores messages from untrusted window sources", async () => {
    const targetWin = new MockTargetWindow() as any;
    const attackerWin = new MockTargetWindow() as any;

    const bridge = createHostBridge(targetWin, {
      workspaceId: "workspace-1",
      tabId: "tab-1",
    });

    const handled = await bridge.handleMessage({
      source: attackerWin,
      data: {
        polymaxAction: "storage.set",
        polymaxRequestId: 601,
        key: "exploit",
        value: "attack",
      },
    } as any);

    expect(handled).toBe(false);
    expect(targetWin.receivedMessages.length).toBe(0);
    expect(attackerWin.receivedMessages.length).toBe(0);
  });

  it("carries the active theme in the ui.ready ack and answers theme.get", async () => {
    const targetWin = new MockTargetWindow() as any;
    const bridge = createHostBridge(targetWin, {
      workspaceId: "workspace-1",
      tabId: "tab-1",
      getTheme: () => "cyber",
    });

    await bridge.handleMessage({
      source: targetWin,
      data: { polymaxAction: "ui.ready", polymaxRequestId: 701 },
    } as any);
    expect(targetWin.receivedMessages[0].result).toMatchObject({ ready: true, theme: "cyber" });

    await bridge.handleMessage({
      source: targetWin,
      data: { polymaxAction: "theme.get", polymaxRequestId: 702 },
    } as any);
    expect(targetWin.receivedMessages[1].result).toBe("cyber");
  });

  it("defaults to the void theme without a theme provider", async () => {
    const targetWin = new MockTargetWindow() as any;
    const bridge = createHostBridge(targetWin, {
      workspaceId: "workspace-1",
      tabId: "tab-1",
    });

    await bridge.handleMessage({
      source: targetWin,
      data: { polymaxAction: "ui.ready", polymaxRequestId: 703 },
    } as any);
    expect(targetWin.receivedMessages[0].result).toMatchObject({ ready: true, theme: "void" });
  });

  it("pushes live theme changes into the guest window", () => {
    const targetWin = new MockTargetWindow() as any;
    const bridge = createHostBridge(targetWin, {
      workspaceId: "workspace-1",
      tabId: "tab-1",
      getTheme: () => "amber",
    });

    bridge.pushTheme("amber");
    expect(targetWin.receivedMessages[0]).toMatchObject({ polymaxTheme: "amber" });
  });

  it("guest script applies the acked theme and listens for live pushes", () => {
    expect(GUEST_BRIDGE_SCRIPT).toContain("polymaxTheme");
    expect(GUEST_BRIDGE_SCRIPT).toContain("dataset.theme");
    expect(GUEST_BRIDGE_SCRIPT).toContain("theme.get");
  });
});
