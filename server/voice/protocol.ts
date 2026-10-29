/**
 * Meta Realtime Transcription protocol helpers.
 * Verified against dev.meta.ai/docs/api-reference/voice/realtime + schemas.
 *
 * The browser never sees MODEL_API_KEY. It connects to our own
 * `/api/voice/realtime` endpoint; the server opens the upstream
 * `wss://api.meta.ai/v1/asr/realtime` socket and injects the credential
 * in the handshake frame.
 */

export const VOICE_AUDIO_ENCODING = "PCM_24KHZ" as const;
export const VOICE_SAMPLE_RATE = 24000;
export const VOICE_FRAME_MS = 80;
/** Bytes per 80ms frame of 16-bit mono PCM at 24kHz. */
export const VOICE_FRAME_BYTES = (VOICE_SAMPLE_RATE * 2 * VOICE_FRAME_MS) / 1000;

export type VoiceMode = "PUSH_TO_TALK" | "ENDPOINTING" | "DIARIZATION";

export interface VoiceHandshake {
  authorization: { accessToken: string };
  audioEncoding: typeof VOICE_AUDIO_ENCODING;
  model: string;
  mode: VoiceMode;
}

export function buildUpstreamUrl(baseUrl: string, sessionId: string): string {
  const sep = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${sep}sessionId=${encodeURIComponent(sessionId)}`;
}

export function buildHandshake(apiKey: string, model: string, mode: VoiceMode = "PUSH_TO_TALK"): VoiceHandshake {
  return {
    authorization: { accessToken: `Bearer ${apiKey}` },
    audioEncoding: VOICE_AUDIO_ENCODING,
    model,
    mode,
  };
}

export function newSessionId(prefix = "voice"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export type VoiceServerEvent =
  | { kind: "handshake"; sessionId: string }
  | { kind: "transcript"; transcript: string; final: boolean; audioProcessedMs: number }
  | { kind: "speechComplete"; turnId: number; transcript: string; audioProcessedMs: number }
  | { kind: "lifecycle"; type: "speechStart" | "speechEnd"; turnId: number; audioProcessedMs: number }
  | { kind: "audioProgress"; audioProcessedMs: number }
  | { kind: "speaker"; label: string; audioProcessedMs: number }
  | { kind: "error"; message: string; sessionId: string }
  | { kind: "unknown"; raw: unknown };

/**
 * Parse one server text frame. The handshake acknowledgement is the only
 * frame with no `type` field (just `{ sessionId }`).
 */
export function parseServerMessage(data: unknown): VoiceServerEvent {
  let obj: Record<string, any>;
  if (typeof data === "string") {
    try {
      obj = JSON.parse(data);
    } catch {
      return { kind: "unknown", raw: data };
    }
  } else if (data && typeof data === "object") {
    obj = data as Record<string, any>;
  } else {
    return { kind: "unknown", raw: data };
  }

  if (!obj.type && typeof obj.sessionId === "string") {
    return { kind: "handshake", sessionId: obj.sessionId };
  }

  switch (obj.type) {
    case "transcript":
      return {
        kind: "transcript",
        transcript: String(obj.transcript ?? ""),
        final: obj.final === true,
        audioProcessedMs: Number(obj.audioProcessedMs ?? 0),
      };
    case "speechComplete":
      return {
        kind: "speechComplete",
        turnId: Number(obj.turnId ?? 0),
        transcript: String(obj.transcript ?? ""),
        audioProcessedMs: Number(obj.audioProcessedMs ?? 0),
      };
    case "speechStart":
    case "speechEnd":
      return {
        kind: "lifecycle",
        type: obj.type,
        turnId: Number(obj.turnId ?? 0),
        audioProcessedMs: Number(obj.audioProcessedMs ?? 0),
      };
    case "audioProgress":
      return { kind: "audioProgress", audioProcessedMs: Number(obj.audioProcessedMs ?? 0) };
    case "speaker":
      return { kind: "speaker", label: String(obj.label ?? ""), audioProcessedMs: Number(obj.audioProcessedMs ?? 0) };
    case "error":
      return {
        kind: "error",
        message: String(obj.message ?? "Voice session failed."),
        sessionId: String(obj.sessionId ?? ""),
      };
    default:
      return { kind: "unknown", raw: obj };
  }
}

/** Human-readable meaning of upstream close codes (docs: Close codes table). */
export function closeCodeMeaning(code: number): string {
  switch (code) {
    case 1000:
      return "Normal completion. Finish after consuming the final result.";
    case 1008:
      return "Invalid request or streaming-policy failure (backlog / below-real-time ingress). Fix config or pacing; retrying identically fails again.";
    case 1011:
      return "Internal or backend failure. Retry with backoff; if reason is max session duration, open a new session.";
    case 1013:
      return "Rate limited. Back off before reconnecting.";
    default:
      return `WebSocket closed with code ${code}.`;
  }
}
