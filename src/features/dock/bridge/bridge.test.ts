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
    expect(GUEST_BRIDGE_SCRIPT).toContain("ui:");
    expect(GUEST_BRIDGE_SCRIPT).toContain("expand:");
    expect(GUEST_BRIDGE_SCRIPT).toContain("collapse:");
  });

  it("routes openContent to the native Reader and falls back to onOpenUrl", async () => {
    const targetWin = new MockTargetWindow() as any;
    let readerUrl = "";
    const bridge = createHostBridge(targetWin, {
      cityId: "city-1",
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
      cityId: "city-1",
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

  it("persists data with strict per-city and per-tab isolation", async () => {
    const targetWin1 = new MockTargetWindow() as any;
    const targetWin2 = new MockTargetWindow() as any;

    const bridge1 = createHostBridge(targetWin1, { cityId: "city-alpha", tabId: "flashcards" });
    const bridge2 = createHostBridge(targetWin2, { cityId: "city-beta", tabId: "flashcards" });

    // 1. Tab 1 sets a value in city-alpha
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

    // 3. Tab 2 in city-beta reads 'score' — must be null (isolated!)
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

  it("provides contextual city data through getContext", async () => {
    const targetWin = new MockTargetWindow() as any;
    const bridge = createHostBridge(targetWin, {
      cityId: "athens-stoicism",
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
    expect(res.result.cityId).toBe("athens-stoicism");
    expect(res.result.tabId).toBe("matrix");
    expect(res.result.topic).toBe("Stoic Philosophy");
    expect(res.result.notesCount).toBe(5);
  });

  it("handles openUrl safely and blocks forbidden schemes", async () => {
    const targetWin = new MockTargetWindow() as any;
    let openedUrl = "";
    const bridge = createHostBridge(targetWin, {
      cityId: "city-1",
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
      cityId: "city-1",
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

  it("ignores messages from untrusted window sources", async () => {
    const targetWin = new MockTargetWindow() as any;
    const attackerWin = new MockTargetWindow() as any;

    const bridge = createHostBridge(targetWin, {
      cityId: "city-1",
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
});
