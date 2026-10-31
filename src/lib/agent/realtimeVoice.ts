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
  onSpeechStart?: (turnId?: number) => void;
  onSpeechEnd?: (turnId?: number) => void;
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

/** Running counters for mic frames leaving the tab (#177 diagnosis). */
export interface MicFrameStats {
  frames: number;
  bytes: number;
  silentFrames: number;
}

export function emptyMicFrameStats(): MicFrameStats {
  return { frames: 0, bytes: 0, silentFrames: 0 };
}

/**
 * True when a 16-bit PCM frame carries no audible signal. Early-exits on
 * the first sample above threshold, so the per-frame cost is ~zero for
 * live audio and one scan for silence. Silence here means either a muted
 * mic or a stalled capture path — both are "mic light on, zero evidence"
 * cases the status line cannot distinguish without this check.
 */
export function isSilentPcm16LE(buf: ArrayBuffer, threshold = 64): boolean {
  if (buf.byteLength % 2 !== 0 || buf.byteLength === 0) return true;
  const view = new DataView(buf);
  for (let offset = 0; offset < buf.byteLength; offset += 2) {
    if (Math.abs(view.getInt16(offset, true)) > threshold) return false;
  }
  return true;
}

/** Fold one emitted PCM frame into the running counters (mutates, returns). */
export function noteMicFrame(stats: MicFrameStats, buf: ArrayBuffer): MicFrameStats {
  stats.frames += 1;
  stats.bytes += buf.byteLength;
  if (isSilentPcm16LE(buf)) stats.silentFrames += 1;
  return stats;
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
export function connectRealtimeVoice(callbacks: RealtimeVoiceCallbacks = {}): { ws: WebSocket; sessionId: string; close: () => void; opened: Promise<void> } {
  const sessionId = newVoiceSessionId();
  const ws = new WebSocket(buildProxyUrl(sessionId));
  let closed = false;
  let resolveOpened!: () => void;
  let rejectOpened!: (err: Error) => void;
  const opened = new Promise<void>((resolve, reject) => {
    resolveOpened = resolve;
    rejectOpened = reject;
  });
  // An unawaited rejection must never surface as an unhandled error.
  opened.catch(() => {});

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
    if (!obj.type && typeof obj.sessionId === "string") {
      resolveOpened();
      return;
    }

    if (obj.type === "transcript" && typeof obj.transcript === "string") {
      if (obj.final === true) callbacks.onFinal?.(obj.transcript, undefined);
      else if (obj.transcript.trim()) callbacks.onPartial?.(obj.transcript);
      return;
    }
    if (obj.type === "speechStart") {
      callbacks.onSpeechStart?.(typeof obj.turnId === "number" ? obj.turnId : undefined);
      return;
    }
    if (obj.type === "speechEnd") {
      callbacks.onSpeechEnd?.(typeof obj.turnId === "number" ? obj.turnId : undefined);
      return;
    }
    if (obj.type === "speechComplete" && typeof obj.transcript === "string") {
      if (obj.transcript.trim()) callbacks.onFinal?.(obj.transcript, typeof obj.turnId === "number" ? obj.turnId : undefined);
      return;
    }
    if (obj.type === "error") {
      const message = String(obj.message || "Voice session failed.");
      rejectOpened(new Error(message));
      callbacks.onError?.(message);
    }
  });

  ws.addEventListener("error", () => {
    if (!closed) {
      rejectOpened(new Error("Voice connection error."));
      callbacks.onError?.("Voice connection error.");
    }
  });

  ws.addEventListener("close", (event) => {
    closed = true;
    rejectOpened(new Error(`Voice connection closed (${event.code}).`));
    callbacks.onClose?.(event.code, event.code === 1000);
  });

  return {
    ws,
    sessionId,
    opened,
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
 *
 * The processor runs through a zero-gain node into the destination: the
 * ScriptProcessor only fires while connected, but routing raw mic audio to
 * the speakers would play the user's voice back (and feed the agent's own
 * TTS reply into the recognizer). Echo cancellation + suppression on the
 * track constraints further keep the agent's spoken replies out of the
 * transcript.
 */
export async function createMicPcmStreamer(
  onFrame: (pcm: ArrayBuffer) => void,
  onLevel?: (level: number) => void,
  onStats?: (stats: MicFrameStats) => void
): Promise<MicPcmStreamer> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    } as MediaTrackConstraints,
    video: false,
  });
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  const ctx: AudioContext = new AudioCtx();
  // A context created outside a user gesture starts suspended and would
  // capture silence forever: mic light on, zero frames, zero transcripts.
  try {
    await ctx.resume();
  } catch {
    // Resume rejection is advisory; the state check below decides.
  }
  if (ctx.state !== "running") {
    for (const track of stream.getTracks()) track.stop();
    ctx.close().catch(() => {});
    throw new Error("Microphone is blocked by the browser. Allow microphone access and try again.");
  }
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  source.connect(analyser);

  const processor = ctx.createScriptProcessor(4096, 1, 1);
  const silentGain = ctx.createGain();
  silentGain.gain.value = 0;
  const freq = new Uint8Array(analyser.frequencyBinCount);
  let carry = new Float32Array(0);
  // #177: counters for "Listening… but zero frames" diagnosis. Reported
  // through onStats every ~2s; the UI can tell mic-blocked (no callback at
  // all — constructor threw), silent-capture (all silent), and socket-dead
  // (frames counted here, none relayed server-side) apart.
  const stats = emptyMicFrameStats();

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
      const pcm = floatToPcm16LE(frame);
      noteMicFrame(stats, pcm);
      onFrame(pcm);
      if (onStats && stats.frames % 25 === 0) onStats({ ...stats });
      offset += REALTIME_FRAME_SAMPLES;
    }
    carry = merged.slice(offset);

    analyser.getByteFrequencyData(freq);
    let sum = 0;
    for (let i = 0; i < freq.length; i++) sum += freq[i];
    onLevel?.(Math.min(1, sum / freq.length / 128));
  };

  source.connect(processor);
  processor.connect(silentGain);
  silentGain.connect(ctx.destination);

  return {
    stop: () => {
      try {
        processor.disconnect();
      } catch {
        // Ignore
      }
      try {
        silentGain.disconnect();
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
