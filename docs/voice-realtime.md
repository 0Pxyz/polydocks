# Voice Realtime (Meta ASR)

> Status: implemented and verified live (transport fixed; mute/unmute and
> hands-free dock operation working). Transcription only — agent replies
> stay on the client TTS path, and the browser never holds the key.
>
> Source of truth: `dev.meta.ai/docs/api-reference/voice/realtime` + `voice/schemas`.
> Browser never holds `MODEL_API_KEY`. All Meta traffic goes through the
> Bun proxy in `server/voice/proxy.ts`.

## Protocol facts

- Upstream: `wss://api.meta.ai/v1/asr/realtime?sessionId=<id>` (config: `MODEL_REALTIME_URL`).
- First client frame must be JSON handshake within 10s:
  ```json
  { "authorization": { "accessToken": "Bearer <MODEL_API_KEY>" },
    "audioEncoding": "PCM_24KHZ", "model": "muse-voice-transcribe-1.0", "mode": "PUSH_TO_TALK" }
  ```
- Audio: binary frames of signed 16-bit LE mono PCM at 24kHz, paced in real
  time (~80ms / 3840 bytes per frame). This endpoint does not read the HTTP
  `Authorization` header.
- End input: JSON `{ "type": "endStream" }`, then keep reading until close `1000`.
- Server events (ordered, multiplexed): `transcript` (`transcript`, `final`),
  `speechStart` / `speechEnd` (`turnId`), `speechComplete` (`turnId`, full
  `transcript`), `speaker`, `audioProgress`, `error`. Handshake ack is the
  only frame with no `type` (just `{ sessionId }`).
- Close codes: `1000` done, `1008` bad request/pacing (fix, don't blind-retry),
  `1011` backend failure (backoff; new session if max duration),
  `1013` rate limited (back off).

## Architecture

- `server/voice/protocol.ts` — pure helpers (URL, handshake, frame parsing).
- `server/voice/proxy.ts` — Bun `websocket` handlers. One upstream socket per
  browser socket; only `endStream` text frames pass through (handshake is
  server-owned); binary PCM relayed verbatim. Missing key -> `error` frame +
  close `1011`.
- `server/index.ts` — upgrades `/api/voice/realtime` via `server.upgrade(req)`.
- `src/lib/agent/realtimeVoice.ts` — browser client: mic capture, 24kHz
  resample, PCM encode, 80ms pacing, transcript callbacks. STT only.
- `src/features/agent/AgentConversation.tsx` — single Orb toggles the session;
  partial transcripts fill the draft, final transcripts send through the
  existing `/api/agent` SSE loop; agent replies still use `speechSynthesis`.

## Scope note

This endpoint is transcription-only. There is no agent audio-response stream
from Meta here, so "play agent audio" stays on the existing TTS path
(`speakReply`). A full bidirectional voice-agent loop would need a separate
Meta voice-agent endpoint (not documented in the linked pages).
