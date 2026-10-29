/**
 * Meta Realtime Transcription client (browser side).
 *
 * Connects to OUR backend proxy at `/api/voice/realtime` — never to Meta
 * directly, so MODEL_API_KEY stays server-side. Streams 24kHz mono 16-bit
 * PCM binary frames paced at ~80ms and surfaces transcript events.
 *
 * Protocol reference: dev.meta.ai/docs/api-reference/voice/realtime
 * (handshake ack has no `type`; server events: transcript, speechStart,
 * speechEnd, speechComplete, audioProgress, speaker, error).
 */

export const REALTIME_SAMPLE_RATE = 24000;
export const REALTIME_FRAME_MS = 80;
export const REALTIME_FRAME_SAMPLES = (REALTIME_SAMPLE_RATE * REALTIME_FRAME_MS) / 1000;

export interface RealtimeVoiceCallbacks {
  onPartial?: (text: string) => void;
  onFinal?: (text: string, turnId?: number) => void;
  onLevel?: (level: number) => void;
  onEvent?: (event: Record<string, any>) => void;
  onError?: (message: string) => void;
  onClose?: (code: number, normal: boolean) => void;
}

export function buildProxyUrl(sessionId: string): string {
  const proto = typeof window !== "undefined" && window.location.protocol === "https:" ? "wss" : "ws";
  const host = typeof window !== "undefined" ? window.location.host : "localhost:3000";
  return `${proto}://${host}/api/voice/realtime?sessionId=${encodeURIComponent(sessionId)}`;
}

export function newVoiceSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `voice_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
  }
  return `voice_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Linear-interpolation resample of mono float samples to 24kHz. */
export function resampleTo24k(input: Float32Array, inputRate: number): Float32Array {
  if (inputRate === REALTIME_SAMPLE_RATE) return input;
  if (input.length === 0) return new Float32Array(0);
  const ratio = inputRate / REALTIME_SAMPLE_RATE;
  const outLen = Math.max(1, Math.floor(input.length / ratio));
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const frac = pos - i0;
    out[i] = input[i0] * (1 - frac) + input[i1] * frac;
  }
  return out;
}

/** Encode mono float samples (-1..1) as 16-bit little-endian PCM bytes. */
export function floatToPcm16LE(input: Float32Array): ArrayBuffer {
  const buf = new ArrayBuffer(input.length * 2);
  const view = new DataView(buf);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buf;
}

export interface RealtimeVoiceHandle {
  sessionId: string;
  endUtterance: () => void;
  close: () => void;
  readonly closed: boolean;
}

/**
 * Open a realtime transcription session over the backend proxy.
 * The caller owns microphone capture; use `createMicPcmStreamer` below
 * or stream PCM frames manually via the returned socket handle.
 */
export function connectRealtimeVoice(callbacks: RealtimeVoiceCallbacks = {}): { ws: WebSocket; sessionId: string; close: () => void } {
  const sessionId = newVoiceSessionId();
  const ws = new WebSocket(buildProxyUrl(sessionId));
  let closed = false;

  ws.addEventListener("message", (event) => {
    if (typeof event.data !== "string") return;
    let obj: Record<string, any>;
    try {
      obj = JSON.parse(event.data);
    } catch {
      return;
    }
    callbacks.onEvent?.(obj);

    // Handshake acknowledgement: only frame without `type`.
    if (!obj.type && typeof obj.sessionId === "string") return;

    if (obj.type === "transcript" && typeof obj.transcript === "string") {
      if (obj.final === true) callbacks.onFinal?.(obj.transcript, undefined);
      else if (obj.transcript.trim()) callbacks.onPartial?.(obj.transcript);
      return;
    }
    if (obj.type === "speechComplete" && typeof obj.transcript === "string") {
      if (obj.transcript.trim()) callbacks.onFinal?.(obj.transcript, typeof obj.turnId === "number" ? obj.turnId : undefined);
      return;
    }
    if (obj.type === "error") {
      callbacks.onError?.(String(obj.message || "Voice session failed."));
    }
  });

  ws.addEventListener("error", () => {
    if (!closed) callbacks.onError?.("Voice connection error.");
  });

  ws.addEventListener("close", (event) => {
    closed = true;
    callbacks.onClose?.(event.code, event.code === 1000);
  });

  return {
    ws,
    sessionId,
    close: () => {
      closed = true;
      try {
        if (ws.readyState === WebSocket.OPEN) ws.close(1000, "client done");
      } catch {
        // Ignore
      }
    },
  };
}

export interface MicPcmStreamer {
  stop: () => void;
}

/**
 * Capture microphone audio, resample to 24kHz mono PCM, report mic level,
 * and invoke `onFrame` with ~80ms PCM ArrayBuffers paced by the audio clock.
 * Uses ScriptProcessorNode for broad compatibility (no worklet build step).
 */
export async function createMicPcmStreamer(
  onFrame: (pcm: ArrayBuffer) => void,
  onLevel?: (level: number) => void
): Promise<MicPcmStreamer> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  const ctx: AudioContext = new AudioCtx();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  source.connect(analyser);

  const processor = ctx.createScriptProcessor(4096, 1, 1);
  const freq = new Uint8Array(analyser.frequencyBinCount);
  let carry = new Float32Array(0);

  processor.onaudioprocess = (event) => {
    const inputRate = ctx.sampleRate;
    const mono = event.inputBuffer.getChannelData(0);
    const resampled = resampleTo24k(mono, inputRate);
    const merged = new Float32Array(carry.length + resampled.length);
    merged.set(carry, 0);
    merged.set(resampled, carry.length);

    let offset = 0;
    while (offset + REALTIME_FRAME_SAMPLES <= merged.length) {
      const frame = merged.slice(offset, offset + REALTIME_FRAME_SAMPLES);
      onFrame(floatToPcm16LE(frame));
      offset += REALTIME_FRAME_SAMPLES;
    }
    carry = merged.slice(offset);

    analyser.getByteFrequencyData(freq);
    let sum = 0;
    for (let i = 0; i < freq.length; i++) sum += freq[i];
    onLevel?.(Math.min(1, sum / freq.length / 128));
  };

  source.connect(processor);
  processor.connect(ctx.destination);

  return {
    stop: () => {
      try {
        processor.disconnect();
      } catch {
        // Ignore
      }
      try {
        source.disconnect();
      } catch {
        // Ignore
      }
      for (const track of stream.getTracks()) track.stop();
      ctx.close().catch(() => {});
    },
  };
}
