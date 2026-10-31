// Voice upstream probe: streams synthetic PCM straight to Meta ASR and
// prints every server event. Answers "is the upstream alive?" with no
// mic, browser, or proxy involved. Run: bun scripts/voice-probe.ts
const env: Record<string, string> = {};
try {
  for (const line of (await Bun.file(".env").text()).split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
} catch {
  // Fall back to process env (CI, non-checkout runs).
}
const API_KEY = env.MODEL_API_KEY || process.env.MODEL_API_KEY || "";
const BASE = env.MODEL_REALTIME_URL || "wss://api.meta.ai/v1/asr/realtime";
const MODEL = env.MODEL_VOICE_MODEL || "muse-voice-transcribe-1.0";
if (!API_KEY) {
  console.error("no MODEL_API_KEY");
  process.exit(1);
}

const sessionId = `probe_${Date.now().toString(36)}`;
const ws: any = new WebSocket(`${BASE}?sessionId=${encodeURIComponent(sessionId)}`);
const started = Date.now();
let frames = 0;

function pcmSine(seconds: number, freq = 440): Uint8Array {
  const n = Math.floor(24000 * seconds);
  const out = new Uint8Array(n * 2);
  const view = new DataView(out.buffer);
  for (let i = 0; i < n; i++) {
    const s = Math.sin((2 * Math.PI * freq * i) / 24000) * 0.5;
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return out;
}

ws.addEventListener("open", async () => {
  console.log(`[${((Date.now() - started) / 1000).toFixed(1)}s] upstream open; handshake`);
  ws.send(JSON.stringify({
    authorization: { accessToken: `Bearer ${API_KEY}` },
    audioEncoding: "PCM_24KHZ",
    model: MODEL,
    mode: "PUSH_TO_TALK",
  }));
  // 3s of tone in 80ms frames, paced real-time
  const audio = pcmSine(3);
  const FRAME = 24000 * 2 * 80 / 1000;
  for (let off = 0; off < audio.length; off += FRAME) {
    ws.send(audio.slice(off, off + FRAME));
    frames++;
    await new Promise((r) => setTimeout(r, 80));
  }
  console.log(`[${((Date.now() - started) / 1000).toFixed(1)}s] sent ${frames} frames; endStream`);
  ws.send(JSON.stringify({ type: "endStream" }));
});

ws.addEventListener("message", (e: any) => {
  const t = ((Date.now() - started) / 1000).toFixed(1);
  try {
    const o = JSON.parse(typeof e.data === "string" ? e.data : Buffer.from(e.data).toString());
    const summary = o.type === "transcript"
      ? `transcript final=${o.final} chars=${String(o.transcript || "").length} audioProcessedMs=${o.audioProcessedMs}`
      : JSON.stringify(o).slice(0, 300);
    console.log(`[${t}s] <- ${summary}`);
  } catch {
    console.log(`[${t}s] <- (binary ${e.data?.length ?? "?"} bytes)`);
  }
});
ws.addEventListener("error", () => console.log("socket error"));
ws.addEventListener("close", (e: any) => {
  console.log(`closed code=${e.code} reason=${e.reason || ""}`);
  process.exit(0);
});
setTimeout(() => {
  console.log("TIMEOUT: no close after 45s");
  process.exit(2);
}, 45000);
