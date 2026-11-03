import { describe, it, expect, beforeEach, afterEach } from "bun:test";

/**
 * Voice proxy relay regression (#177): per-client frames must reach the
 * upstream socket. A scoping bug (counters local to open(), referenced
 * bare by message()) threw ReferenceError into the catch-all — zero bytes
 * ever reached Meta, zero transcripts, zero errors. These tests drive the
 * real handlers with a fake upstream.
 */

const WS_UPSTREAM_URL = "wss://api.meta.ai/v1/asr/realtime";

function installFakeUpstream() {
  const instances: any[] = [];
  (globalThis as any).__relayInstances = instances;
  class FakeWebSocket {
    static OPEN = 1;
    static CLOSED = 3;
    url: string;
    readyState = 1;
    sent: any[] = [];
    closedWith: any = null;
    listeners = new Map<string, Function[]>();
    constructor(url: string) {
      this.url = url;
      instances.push(this);
    }
    addEventListener(type: string, fn: Function) {
      const list = this.listeners.get(type) || [];
      list.push(fn);
      this.listeners.set(type, list);
    }
    fire(type: string, event: any = {}) {
      for (const fn of this.listeners.get(type) || []) fn(event);
    }
    send(data: any) {
      this.sent.push(data);
    }
    close(code?: number, reason?: string) {
      this.closedWith = { code, reason };
      this.readyState = 3;
    }
  }
  (globalThis as any).WebSocket = FakeWebSocket;
  return instances as any[];
}

function makeClient() {
  return {
    sentToBrowser: [] as string[],
    closed: false as boolean,
    send(data: string) {
      this.sentToBrowser.push(typeof data === "string" ? data : String(data));
    },
    close() {
      this.closed = true;
    },
    data: { sessionId: "test-voice-relay" },
  };
}

// Saved before any mutation: bun runs test files sequentially in one
// process, so globals must be restored for the next file.
const REAL_WS = (globalThis as any).WebSocket;
const REAL_KEY = process.env.MODEL_API_KEY;

describe("voice proxy relay (#177)", () => {
  let proxy: typeof import("../server/voice/proxy");
  let configModule: typeof import("../server/config");
  let savedConfigKey: unknown;

  beforeEach(async () => {
    process.env.MODEL_API_KEY = "test-key-for-relay";
    installFakeUpstream();
    proxy = await import("../server/voice/proxy");
    // The config module parses env once at first import (possibly by an
    // earlier test file, without the key): override the shared instance
    // for this file's lifetime and restore it after.
    configModule = await import("../server/config");
    savedConfigKey = (configModule.config as any).MODEL_API_KEY;
    (configModule.config as any).MODEL_API_KEY = "test-key-for-relay";
    // Fresh module state per test is not available (singleton maps), so
    // every test uses a distinct client object as its map key.
  });

  afterEach(() => {
    (globalThis as any).WebSocket = REAL_WS;
    delete (globalThis as any).__relayInstances;
    if (configModule) (configModule.config as any).MODEL_API_KEY = savedConfigKey;
    if (REAL_KEY === undefined) delete process.env.MODEL_API_KEY;
    else process.env.MODEL_API_KEY = REAL_KEY;
  });

  it("relays binary PCM frames upstream and tracks counters", async () => {
    const client: any = makeClient();
    proxy.voiceWebsocketHandlers.open(client);
    const upstream = (globalThis as any).__relayInstances.at(-1);
    expect(upstream.url.startsWith(WS_UPSTREAM_URL)).toBe(true);
    upstream.fire("open", {});

    const frame = new Uint8Array(3840).fill(7);
    proxy.voiceWebsocketHandlers.message(client, Buffer.from(frame));
    proxy.voiceWebsocketHandlers.message(client, Buffer.from(frame));

    const relayed = upstream.sent.filter((s: any) => s !== undefined && typeof s !== "string");
    expect(relayed.length).toBe(2);
    expect(proxy.relayStateOf(client)?.framesRelayed).toBe(2);
    expect(proxy.relayStateOf(client)?.bytesRelayed).toBe(7680);
  });

  it("passes endStream through once and drops other client text", async () => {
    const client: any = makeClient();
    proxy.voiceWebsocketHandlers.open(client);
    const upstream = (globalThis as any).__relayInstances.at(-1);
    upstream.fire("open", {});

    proxy.voiceWebsocketHandlers.message(client, JSON.stringify({ type: "endStream" }));
    proxy.voiceWebsocketHandlers.message(client, JSON.stringify({ type: "handshake", evil: true }));
    expect(proxy.relayStateOf(client)?.endStreamSeen).toBe(true);
    const texts = upstream.sent.filter((s: any) => typeof s === "string").map((s: string) => JSON.parse(s));
    // Handshake (server-owned) + exactly one endStream.
    expect(texts.filter((t: any) => t.type === "endStream").length).toBe(1);
    expect(texts.some((t: any) => t.evil)).toBe(false);
  });

  it("ignores messages with no upstream instead of throwing", async () => {
    const client: any = makeClient();
    expect(() =>
      proxy.voiceWebsocketHandlers.message(client, Buffer.from(new Uint8Array(3840)))
    ).not.toThrow();
    expect(proxy.relayStateOf(client)).toBeUndefined();
  });

  it("relays upstream transcript events back to the browser client", async () => {
    const client: any = makeClient();
    proxy.voiceWebsocketHandlers.open(client);
    const upstream = (globalThis as any).__relayInstances.at(-1);
    upstream.fire("open", {});
    upstream.fire("message", {
      data: JSON.stringify({ type: "transcript", transcript: "hello", final: false, audioProcessedMs: 80 }),
    });
    const last = client.sentToBrowser.at(-1);
    expect(JSON.parse(last).transcript).toBe("hello");
  });

  it("cleans up relay state on close", async () => {
    const client: any = makeClient();
    proxy.voiceWebsocketHandlers.open(client);
    proxy.voiceWebsocketHandlers.close(client);
    expect(proxy.relayStateOf(client)).toBeUndefined();
  });
});
