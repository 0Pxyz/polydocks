import { describe, expect, it } from "bun:test";
import {
  floatToPcm16LE,
  isSilentPcm16LE,
  noteMicFrame,
  emptyMicFrameStats,
} from "../src/lib/agent/realtimeVoice";

/**
 * Mic frame counters (#177): distinguish silent capture from live audio
 * without a microphone. The browser repro (mic + VOICE_DEBUG=1) stays
 * blocked; these pin the helpers the repro will read.
 */
describe("voice frame stats (#177)", () => {
  it("treats all-zero PCM as silence", () => {
    const silent = floatToPcm16LE(new Float32Array(1920));
    expect(isSilentPcm16LE(silent)).toBe(true);
    expect(isSilentPcm16LE(new ArrayBuffer(0))).toBe(true);
  });

  it("treats audible PCM as live", () => {
    const live = new Float32Array(1920);
    live[1000] = 0.5;
    expect(isSilentPcm16LE(floatToPcm16LE(live))).toBe(false);
  });

  it("ignores sub-threshold noise, catches loud samples", () => {
    const noise = new Float32Array(1920);
    noise[500] = 0.001; // ~32 LSB, under the default 64 threshold
    expect(isSilentPcm16LE(floatToPcm16LE(noise))).toBe(true);
    noise[501] = 0.9;
    expect(isSilentPcm16LE(floatToPcm16LE(noise))).toBe(false);
  });

  it("accumulates frame counters", () => {
    const stats = emptyMicFrameStats();
    noteMicFrame(stats, floatToPcm16LE(new Float32Array(1920)));
    const live = new Float32Array(1920);
    live[7] = 0.4;
    noteMicFrame(stats, floatToPcm16LE(live));
    expect(stats.frames).toBe(2);
    expect(stats.silentFrames).toBe(1);
    expect(stats.bytes).toBe(1920 * 2 * 2);
  });
});
