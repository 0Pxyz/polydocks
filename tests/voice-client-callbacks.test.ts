import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { connectRealtimeVoice } from "../src/lib/agent/realtimeVoice";

/**
 * Voice client contract (#177): the composer must surface what the user
 * says — partials preview, finals hand off. Drives the real
 * connectRealtimeVoice against a fake socket server.
 */
const REAL_WS = (globalThis as any).WebSocket;

function installFakeServer() {
  const servers: any[] = [];
  class FakeClientSocket {
    static OPEN = 1;
    url: string;
    readyState = 1;
    sent: any[] = [];
    listeners = new Map<string, Function[]>();
    constructor(url: string) {
      this.url = url;
      servers.push(this);
    }
    addEventListener(type: string, fn: Function) {
      const list = this.listeners.get(type) || [];
      list.push(fn);
      this.listeners.set(type, list);
    }
    serverPush(data: string) {
      for (const fn of this.listeners.get("message") || []) fn({ data });
    }
    send(data: any) {
      this.sent.push(data);
    }
    close() {
      this.readyState = 3;
      for (const fn of this.listeners.get("close") || []) fn({ code: 1000 });
    }
  }
  (globalThis as any).WebSocket = FakeClientSocket;
  return servers as any[];
}

describe("voice client callbacks (#177)", () => {
  beforeEach(() => {
    installFakeServer();
  });

  afterEach(() => {
    (globalThis as any).WebSocket = REAL_WS;
  });

  it("resolves opened on the handshake ack and surfaces partials", async () => {
    const partials: string[] = [];
    const conn = connectRealtimeVoice({ onPartial: (t) => partials.push(t) });
    // The connection exposes the socket (fake server side in tests).
    const fake = (conn as any).ws;
    fake.serverPush(JSON.stringify({ sessionId: "s1" }));
    await conn.opened;
    fake.serverPush(
      JSON.stringify({ type: "transcript", transcript: "hello wo", final: false, audioProcessedMs: 80 })
    );
    expect(partials).toEqual(["hello wo"]);
    conn.close();
  });

  it("fires onFinal for final transcripts and speechComplete with turnId", async () => {
    const finals: Array<{ text: string; turn?: number }> = [];
    const speechEnds: Array<number | undefined> = [];
    const conn = connectRealtimeVoice({
      onFinal: (t, turn) => finals.push({ text: t, turn }),
      onSpeechEnd: (turn) => speechEnds.push(turn),
    });
    const fake = (conn as any).ws;
    fake.serverPush(JSON.stringify({ sessionId: "s1" }));
    await conn.opened;
    fake.serverPush(
      JSON.stringify({ type: "speechEnd", turnId: 3, audioProcessedMs: 400 })
    );
    fake.serverPush(
      JSON.stringify({ type: "speechComplete", turnId: 3, transcript: "hello world", audioProcessedMs: 400 })
    );
    expect(speechEnds).toEqual([3]);
    expect(finals).toEqual([{ text: "hello world", turn: 3 }]);
    conn.close();
  });

  it("surfaces server errors and close codes", async () => {
    const errors: string[] = [];
    const closes: Array<{ code: number; normal: boolean }> = [];
    const conn = connectRealtimeVoice({
      onError: (m) => errors.push(m),
      onClose: (code, normal) => closes.push({ code, normal }),
    });
    const fake = (conn as any).ws;
    fake.serverPush(JSON.stringify({ sessionId: "s1" }));
    await conn.opened;
    fake.serverPush(
      JSON.stringify({ type: "error", message: "boom", sessionId: "s1" })
    );
    expect(errors).toEqual(["boom"]);
    conn.close();
    expect(closes).toEqual([{ code: 1000, normal: true }]);
  });
});
