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
  type VoiceMode,
} from "./protocol";

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

    let upstream: WebSocket;
    try {
      upstream = new WebSocket(buildUpstreamUrl(config.MODEL_REALTIME_URL, sessionId));
    } catch (err: any) {
      clientSend(client, { type: "error", message: `Could not open voice session: ${err?.message || err}`, sessionId });
      try {
        client.close(1011, "upstream open failed");
      } catch {
        // Ignore
      }
      return;
    }
    upstreamByClient.set(client, upstream);

    upstream.addEventListener("open", () => {
      try {
        upstream.send(JSON.stringify(buildHandshake(apiKey, config.MODEL_VOICE_MODEL, "PUSH_TO_TALK" as VoiceMode)));
      } catch (err: any) {
        clientSend(client, { type: "error", message: `Voice handshake failed: ${err?.message || err}`, sessionId });
      }
    });

    upstream.addEventListener("message", (event: MessageEvent) => {
      // Relay upstream text frames verbatim; binary frames are ignored (transcripts only).
      if (typeof event.data === "string") {
        clientSend(client, event.data);
      }
    });

    upstream.addEventListener("error", () => {
      clientSend(client, { type: "error", message: "Voice upstream connection error.", sessionId });
    });

    upstream.addEventListener("close", (event: CloseEvent) => {
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
          if (parsed && parsed.type === "endStream") upstream.send(JSON.stringify({ type: "endStream" }));
          // Drop any other client text frame: handshake is server-owned.
        } catch {
          // Drop non-JSON text frames
        }
        return;
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
