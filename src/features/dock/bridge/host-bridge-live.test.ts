import { describe, it, expect, beforeEach, afterEach } from "bun:test";
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

// In-memory mock guest window for message passing
class MockGuestWindow {
  public receivedMessages: any[] = [];

  postMessage(message: any) {
    this.receivedMessages.push(message);
  }
}

/**
 * Live-window regression tests for the host bridge.
 *
 * Root cause under test: DynamicPluginSandbox / DynamicTabContainer used to
 * capture `iframeRef.current?.contentWindow` ONCE at mount — but the iframe
 * only renders after the srcdoc fetch resolves, so the captured window was
 * null forever and every host reply was dropped silently. The bridge must
 * therefore resolve the target window at MESSAGE time from the iframe
 * element (here: a getter standing in for the ref), not at creation time.
 */
describe("Host bridge live-window resolution (bridge-fix regression)", () => {
  let savedWindow: unknown;

  beforeEach(() => {
    (globalThis as any).localStorage = new MockLocalStorage();
    savedWindow = (globalThis as any).window;
    delete (globalThis as any).window;
  });

  afterEach(() => {
    if (savedWindow === undefined) delete (globalThis as any).window;
    else (globalThis as any).window = savedWindow;
  });

  it("replies to storage.get/set when the iframe window appears AFTER bridge creation", async () => {
    // Fake iframe ref: contentWindow is null at bridge creation (the bug),
    // populated later once the srcdoc iframe mounts.
    const iframeRef: { current: { contentWindow: unknown } | null } = { current: null };
    const bridge = createHostBridge(() => (iframeRef.current?.contentWindow as Window) ?? null, {
      cityId: "city-1",
      tabId: "tab-1",
    });

    const guestWin = new MockGuestWindow() as any;
    iframeRef.current = { contentWindow: guestWin };

    await bridge.handleMessage({
      source: guestWin,
      data: { polymaxAction: "storage.set", polymaxRequestId: 1, key: "read", value: { a: 1 } },
    } as any);
    expect(guestWin.receivedMessages[0]).toEqual({
      polymaxResponseId: 1,
      result: true,
      error: undefined,
    });

    await bridge.handleMessage({
      source: guestWin,
      data: { polymaxAction: "storage.get", polymaxRequestId: 2, key: "read" },
    } as any);
    expect(guestWin.receivedMessages[1]).toEqual({
      polymaxResponseId: 2,
      result: { a: 1 },
      error: undefined,
    });

    bridge.destroy();
  });

  it("replies to openContent when the iframe window appears AFTER bridge creation", async () => {
    const iframeRef: { current: { contentWindow: unknown } | null } = { current: null };
    let opened = "";
    const bridge = createHostBridge(() => (iframeRef.current?.contentWindow as Window) ?? null, {
      cityId: "city-1",
      tabId: "tab-1",
      onOpenContent: (url) => {
        opened = url;
      },
    });

    const guestWin = new MockGuestWindow() as any;
    iframeRef.current = { contentWindow: guestWin };

    await bridge.handleMessage({
      source: guestWin,
      data: { polymaxAction: "openContent", polymaxRequestId: 7, url: "https://example.com/article" },
    } as any);

    expect(opened).toBe("https://example.com/article");
    expect(guestWin.receivedMessages[0]).toEqual({
      polymaxResponseId: 7,
      result: true,
      error: undefined,
    });

    bridge.destroy();
  });

  it("ignores messages while no guest window exists yet (nothing to verify source against)", async () => {
    const iframeRef: { current: { contentWindow: unknown } | null } = { current: null };
    const bridge = createHostBridge(() => (iframeRef.current?.contentWindow as Window) ?? null, {
      cityId: "city-1",
      tabId: "tab-1",
    });

    const stranger = new MockGuestWindow() as any;
    const handled = await bridge.handleMessage({
      source: stranger,
      data: { polymaxAction: "storage.set", polymaxRequestId: 3, key: "x", value: 1 },
    } as any);

    expect(handled).toBe(false);
    expect(stranger.receivedMessages.length).toBe(0);
    bridge.destroy();
  });

  it("ignores messages from a foreign window once mounted (opaque origin: source identity is the check)", async () => {
    const guestWin = new MockGuestWindow() as any;
    const attackerWin = new MockGuestWindow() as any;
    const bridge = createHostBridge(() => guestWin, { cityId: "city-1", tabId: "tab-1" });

    const handled = await bridge.handleMessage({
      source: attackerWin,
      data: { polymaxAction: "storage.set", polymaxRequestId: 4, key: "x", value: 1 },
    } as any);

    expect(handled).toBe(false);
    expect(guestWin.receivedMessages.length).toBe(0);
    expect(attackerWin.receivedMessages.length).toBe(0);
    bridge.destroy();
  });

  it("logs a debug line (instead of dropping silently) when the window is gone at reply time", async () => {
    let guestWin: any = new MockGuestWindow();
    const debugLines: string[] = [];
    const origDebug = console.debug;
    console.debug = (...args: any[]) => {
      debugLines.push(args.map(String).join(" "));
    };
    try {
      const bridge = createHostBridge(() => guestWin as Window | null, {
        cityId: "city-1",
        tabId: "tab-1",
        // Async getContext: the iframe can navigate away / unmount between
        // request and reply. Simulate by clearing the window mid-flight.
        getContext: async () => {
          guestWin = null;
          return { topic: "gone" };
        },
      });

      const liveWin = guestWin;
      const handled = await bridge.handleMessage({
        source: liveWin,
        data: { polymaxAction: "getContext", polymaxRequestId: 5 },
      } as any);

      expect(handled).toBe(true);
      expect(liveWin.receivedMessages.length).toBe(0);
      expect(debugLines.some((l) => l.includes("5"))).toBe(true);
      bridge.destroy();
    } finally {
      console.debug = origDebug;
    }
  });

  it("unbinds the window listener on destroy so a srcdoc reload cannot double-handle", async () => {
    const listeners = new Map<string, Set<(e: any) => void>>();
    (globalThis as any).window = {
      addEventListener: (type: string, fn: (e: any) => void) => {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)!.add(fn);
      },
      removeEventListener: (type: string, fn: (e: any) => void) => {
        listeners.get(type)?.delete(fn);
      },
    };

    const guestWin = new MockGuestWindow() as any;
    let handled = 0;
    const opts = {
      cityId: "city-1",
      tabId: "tab-1",
      onOpenContent: () => {
        handled += 1;
      },
    };

    // Mount: bridge A live.
    const bridgeA = createHostBridge(guestWin, opts);
    expect(listeners.get("message")?.size).toBe(1);

    // srcdoc reload: A destroyed, B created — exactly one listener remains.
    bridgeA.destroy();
    expect(listeners.get("message")?.size).toBe(0);
    const bridgeB = createHostBridge(guestWin, opts);
    expect(listeners.get("message")?.size).toBe(1);

    // A stale dispatch through B's listener handles exactly once.
    const [listener] = [...listeners.get("message")!];
    listener({ source: guestWin, data: { polymaxAction: "openContent", polymaxRequestId: 9, url: "https://example.com/x" } });
    await new Promise((r) => setTimeout(r, 10));
    expect(handled).toBe(1);

    bridgeB.destroy();
    expect(listeners.get("message")?.size).toBe(0);
  });
});
