import { describe, expect, it } from "bun:test";
import {
  VOICE_FRAME_BYTES,
  buildHandshake,
  buildUpstreamUrl,
  closeCodeMeaning,
  newSessionId,
  parseServerMessage,
} from "../server/voice/protocol";
import {
  buildProxyUrl,
  floatToPcm16LE,
  newVoiceSessionId,
  resampleTo24k,
} from "../src/lib/agent/realtimeVoice";

describe("Voice realtime protocol (Meta ASR)", () => {
  it("builds the upstream URL with sessionId", () => {
    expect(buildUpstreamUrl("wss://api.meta.ai/v1/asr/realtime", "abc")).toBe(
      "wss://api.meta.ai/v1/asr/realtime?sessionId=abc"
    );
  });

  it("builds a handshake with the credential in the frame (not headers)", () => {
    const hs = buildHandshake("KEY123", "muse-voice-transcribe-1.0");
    expect(hs).toEqual({
      authorization: { accessToken: "Bearer KEY123" },
      audioEncoding: "PCM_24KHZ",
      model: "muse-voice-transcribe-1.0",
      mode: "PUSH_TO_TALK",
    });
  });

  it("defines 80ms PCM frames at 24kHz mono 16-bit", () => {
    expect(VOICE_FRAME_BYTES).toBe(3840);
  });

  it("parses the handshake ack (no type field) and transcript events", () => {
    expect(parseServerMessage(JSON.stringify({ sessionId: "s1" }))).toEqual({
      kind: "handshake",
      sessionId: "s1",
    });
    expect(
      parseServerMessage(JSON.stringify({ type: "transcript", transcript: "hello", final: false, audioProcessedMs: 80 }))
    ).toEqual({ kind: "transcript", transcript: "hello", final: false, audioProcessedMs: 80 });
    expect(
      parseServerMessage(JSON.stringify({ type: "speechComplete", turnId: 2, transcript: "hi", audioProcessedMs: 400 }))
    ).toEqual({ kind: "speechComplete", turnId: 2, transcript: "hi", audioProcessedMs: 400 });
    expect(parseServerMessage(JSON.stringify({ type: "error", message: "bad", sessionId: "s1" })).kind).toBe("error");
  });

  it("explains close codes without hallucinating recovery", () => {
    expect(closeCodeMeaning(1000)).toContain("Normal");
    expect(closeCodeMeaning(1008)).toContain("backlog");
    expect(closeCodeMeaning(1013)).toContain("Rate limited");
  });

  it("mints unique session ids", () => {
    expect(newSessionId()).not.toBe(newSessionId());
    expect(newVoiceSessionId()).not.toBe(newVoiceSessionId());
  });

  it("encodes PCM16LE with clamping", () => {
    const buf = floatToPcm16LE(new Float32Array([0, 1, -1, 2]));
    const view = new DataView(buf);
    expect(buf.byteLength).toBe(8);
    expect(view.getInt16(0, true)).toBe(0);
    expect(view.getInt16(2, true)).toBe(0x7fff);
    expect(view.getInt16(4, true)).toBe(-0x8000);
  });

  it("resamples by linear interpolation", () => {
    const out = resampleTo24k(new Float32Array([0, 1]), 12000);
    expect(out.length).toBe(4);
    expect(out[0]).toBeCloseTo(0, 5);
    expect(out[3]).toBeCloseTo(1, 5);
  });

  it("builds a same-origin proxy URL (no Meta host, no key)", () => {
    const url = buildProxyUrl("s1");
    expect(url).toContain("/api/voice/realtime?sessionId=s1");
    expect(url).not.toContain("api.meta.ai");
  });
});

describe("voice session handshake (opened promise)", () => {
  type Listener = (event: any) => void;

  function mockSocket() {
    const listeners = new Map<string, Listener[]>();
    const socket: any = {
      readyState: 0,
      sent: [] as any[],
      send(payload: any) {
        socket.sent.push(payload);
      },
      close() {
        socket.readyState = 3;
        for (const fn of listeners.get("close") || []) fn({ code: 1000 });
      },
      emit(name: string, event: any) {
        for (const fn of listeners.get(name) || []) fn(event);
      },
      addEventListener(name: string, fn: Listener) {
        listeners.set(name, [...(listeners.get(name) || []), fn]);
      },
    };
    return socket;
  }

  async function withMockSocket(socket: any, fn: () => Promise<void>) {
    const RealWebSocket = globalThis.WebSocket;
    (globalThis as any).WebSocket = function () {
      return socket;
    };
    try {
      await fn();
    } finally {
      globalThis.WebSocket = RealWebSocket;
    }
  }

  it("opened resolves on the handshake ack, before any transcript", async () => {
    const { connectRealtimeVoice } = await import("../src/lib/agent/realtimeVoice");
    const socket = mockSocket();
    let resolved = false;
    await withMockSocket(socket, async () => {
      const conn = connectRealtimeVoice({});
      void conn.opened.then(() => {
        resolved = true;
      });
      await Promise.resolve();
      expect(resolved).toBe(false);
      socket.readyState = 1;
      socket.emit("message", { data: JSON.stringify({ sessionId: "abc" }) });
      await Promise.resolve();
      expect(resolved).toBe(true);
      conn.close();
    });
  });

  it("a server error frame rejects opened with the server message", async () => {
    const { connectRealtimeVoice } = await import("../src/lib/agent/realtimeVoice");
    const socket = mockSocket();
    await withMockSocket(socket, async () => {
      let seen = "";
      const conn = connectRealtimeVoice({
        onError: (m) => {
          seen = m;
        },
      });
      const rejection = conn.opened.then(
        () => "resolved",
        (e: Error) => e.message
      );
      socket.emit("message", {
        data: JSON.stringify({ type: "error", message: "Voice realtime is not configured." }),
      });
      expect(await rejection).toBe("Voice realtime is not configured.");
      expect(seen).toBe("Voice realtime is not configured.");
      conn.close();
    });
  });
});
