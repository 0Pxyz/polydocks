/**
 * WebSocket proxy for Meta Realtime Transcription.
 *
 * Browser -> Bun (/api/voice/realtime) -> Meta (wss://api.meta.ai/v1/asr/realtime)
 * The Meta credential travels only in the upstream handshake frame, which
 * the server builds. It is never sent to the browser.
 *
 * Wire-up (see server/index.ts default export):
 *   fetch(req, server) { if (pathname === "/api/voice/realtime" && server.upgrade(req)) return; ... }
 *   websocket: voiceWebsocketHandlers
 */

import { config } from "../config";
import {
  buildHandshake,
  buildUpstreamUrl,
  closeCodeMeaning,
  newSessionId,
  parseServerMessage,
  type VoiceMode,
} from "./protocol";

/**
 * Server-side voice observability. Enable with VOICE_DEBUG=1: logs the
 * session lifecycle, byte counts and upstream event kinds (never audio
 * bytes or transcript text beyond length). Off by default — audio
 * sessions are chatty and transcripts are user content.
 */
const VOICE_DEBUG = process.env.VOICE_DEBUG === "1";

function vlog(sessionId: string, msg: string, extra?: Record<string, unknown>): void {
  if (!VOICE_DEBUG) return;
  try {
    console.log(`[voice ${sessionId}] ${msg}`, extra ? JSON.stringify(extra) : "");
  } catch {
    // Logging must never break the relay path.
  }
}

const upstreamByClient = new Map<object, WebSocket>();
const sessionByClient = new Map<object, string>();

function clientSend(ws: any, payload: unknown): void {
  try {
    ws.send(typeof payload === "string" ? payload : JSON.stringify(payload));
  } catch {
    // Ignore send failures on closing sockets
  }
}

function closeUpstream(client: object): void {
  const upstream = upstreamByClient.get(client);
  upstreamByClient.delete(client);
  sessionByClient.delete(client);
  try {
    if (upstream && upstream.readyState === WebSocket.OPEN) upstream.close(1000, "client done");
  } catch {
    // Ignore
  }
}

export function isVoiceRealtimeRequest(req: Request): boolean {
  try {
    return new URL(req.url).pathname === "/api/voice/realtime";
  } catch {
    return false;
  }
}

export function voiceSessionIdFrom(req: Request): string {
  try {
    return new URL(req.url).searchParams.get("sessionId") || newSessionId();
  } catch {
    return newSessionId();
  }
}

export const voiceWebsocketHandlers = {
  open(client: any): void {
    const apiKey = config.MODEL_API_KEY?.trim();
    if (!apiKey) {
      clientSend(client, { type: "error", message: "Voice realtime is not configured (missing MODEL_API_KEY).", sessionId: "" });
      try {
        client.close(1011, "voice not configured");
      } catch {
        // Ignore
      }
      return;
    }

    const sessionId = typeof client.data?.sessionId === "string" ? client.data.sessionId : newSessionId();
    sessionByClient.set(client, sessionId);
    vlog(sessionId, "client connected");

    let upstream: WebSocket;
    try {
      upstream = new WebSocket(buildUpstreamUrl(config.MODEL_REALTIME_URL, sessionId));
    } catch (err: any) {
      vlog(sessionId, "upstream open failed", { error: err?.message || String(err) });
      clientSend(client, { type: "error", message: `Could not open voice session: ${err?.message || err}`, sessionId });
      try {
        client.close(1011, "upstream open failed");
      } catch {
        // Ignore
      }
      return;
    }
    upstreamByClient.set(client, upstream);

    let framesRelayed = 0;
    let bytesRelayed = 0;
    let transcriptEvents = 0;
    let endStreamSeen = false;

    upstream.addEventListener("open", () => {
      vlog(sessionId, "upstream open; sending handshake");
      try {
        upstream.send(JSON.stringify(buildHandshake(apiKey, config.MODEL_VOICE_MODEL, "PUSH_TO_TALK" as VoiceMode)));
      } catch (err: any) {
        vlog(sessionId, "handshake send failed", { error: err?.message || String(err) });
        clientSend(client, { type: "error", message: `Voice handshake failed: ${err?.message || err}`, sessionId });
      }
    });

    upstream.addEventListener("message", (event: MessageEvent) => {
      // Relay upstream text frames verbatim; binary frames are ignored (transcripts only).
      if (typeof event.data === "string") {
        const parsed = parseServerMessage(event.data);
        if (parsed.kind === "transcript" || parsed.kind === "speechComplete") transcriptEvents++;
        if (parsed.kind === "error") {
          vlog(sessionId, "upstream error frame", { message: parsed.message });
        } else if (parsed.kind === "transcript" || parsed.kind === "speechComplete") {
          vlog(sessionId, "upstream transcript event", {
            kind: parsed.kind,
            chars: parsed.transcript.length,
            final: parsed.kind === "transcript" ? parsed.final : true,
          });
        } else if (parsed.kind !== "handshake" && parsed.kind !== "audioProgress") {
          vlog(sessionId, "upstream event", { kind: parsed.kind });
        }
        clientSend(client, event.data);
      }
    });

    upstream.addEventListener("error", () => {
      vlog(sessionId, "upstream socket error", { framesRelayed, bytesRelayed, transcriptEvents });
      clientSend(client, { type: "error", message: "Voice upstream connection error.", sessionId });
    });

    upstream.addEventListener("close", (event: CloseEvent) => {
      vlog(sessionId, "upstream close", {
        code: event.code,
        reason: event.reason || closeCodeMeaning(event.code),
        framesRelayed,
        bytesRelayed,
        transcriptEvents,
        endStreamSeen,
      });
      if (event.code !== 1000) {
        clientSend(client, { type: "error", message: closeCodeMeaning(event.code), sessionId });
      }
      try {
        client.close(event.code === 1000 ? 1000 : 1011, event.reason || "upstream closed");
      } catch {
        // Ignore
      }
      upstreamByClient.delete(client);
      sessionByClient.delete(client);
    });
  },

  message(client: any, message: string | Buffer | ArrayBuffer | Uint8Array): void {
    const upstream = upstreamByClient.get(client);
    if (!upstream || upstream.readyState !== WebSocket.OPEN) return;
    try {
      // Text frames: only endStream passthrough; binary frames: raw PCM relay.
      if (typeof message === "string") {
        const trimmed = message.trim();
        if (!trimmed) return;
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed && parsed.type === "endStream") {
            endStreamSeen = true;
            vlog(sessionId, "client endStream", { framesRelayed, bytesRelayed, transcriptEvents });
            upstream.send(JSON.stringify({ type: "endStream" }));
          }
          // Drop any other client text frame: handshake is server-owned.
        } catch {
          // Drop non-JSON text frames
        }
        return;
      }
      const bytes = (message as any)?.byteLength ?? (message as any)?.length ?? 0;
      framesRelayed++;
      bytesRelayed += bytes;
      if (framesRelayed === 1 || framesRelayed % 375 === 0) {
        // First frame + ~every 30s at 80ms pacing: proves audio ingress.
        vlog(sessionId, "relaying client audio", { framesRelayed, bytesRelayed });
      }
      upstream.send(message as any);
    } catch {
      // Ignore relay failures; close handlers report them
    }
  },

  close(client: any): void {
    closeUpstream(client);
  },
};
