import { describe, expect, it } from "bun:test";
import {
  adaptToThought,
  feedThoughtEvent,
  jobOpacity,
  makeThoughtLine,
  pushLine,
  pushThought,
  riseDurationMs,
  subscribeJobs,
  subscribeThoughts,
  MAX_VISIBLE_LINES,
  type ThoughtLine,
} from "../src/lib/agent/thoughtStream";

function lines(n: number): ThoughtLine[] {
  return Array.from({ length: n }, (_, i) => makeThoughtLine(`line ${i + 1}`, { at: i }));
}

describe("thought queue: capped, pruned, paced", () => {
  it("keeps at most MAX_VISIBLE_LINES, dropping the oldest", () => {
    let state: ThoughtLine[] = [];
    for (const line of lines(MAX_VISIBLE_LINES + 3)) {
      state = pushLine(state, line);
    }
    expect(state).toHaveLength(MAX_VISIBLE_LINES);
    expect(state[0].text).toBe(`line 4`);
    expect(state[MAX_VISIBLE_LINES - 1].text).toBe(`line ${MAX_VISIBLE_LINES + 3}`);
  });

  it("rise duration shrinks as the queue grows, never below the floor", () => {
    const d1 = riseDurationMs(1);
    const d2 = riseDurationMs(2);
    const d4 = riseDurationMs(4);
    const d100 = riseDurationMs(100);
    expect(d1).toBeGreaterThan(d2);
    expect(d2).toBeGreaterThan(d4);
    expect(d100).toBe(2500);
    expect(d100).toBeLessThanOrEqual(d1);
  });

  it("per-job opacity varies subtly without labels", () => {
    const a = jobOpacity("job-a");
    const b = jobOpacity("job-b");
    expect(a).toBeGreaterThanOrEqual(0.75);
    expect(a).toBeLessThanOrEqual(1);
    expect(jobOpacity(undefined)).toBe(1);
    // Stable per id (no flicker between renders).
    expect(jobOpacity("job-a")).toBe(a);
    expect(typeof b).toBe("number");
  });

  it("pushThought ignores blank text, trims and caps length", () => {
    const seen: ThoughtLine[] = [];
    const off = subscribeThoughts((l) => seen.push(l));
    pushThought("   ");
    expect(seen).toHaveLength(0);
    pushThought("  hello  ");
    expect(seen[0].text).toBe("hello");
    pushThought("x".repeat(500));
    expect(seen[1].text.length).toBeLessThanOrEqual(140);
    off();
  });
});

describe("thought adapter: stream fades, finals persist", () => {
  it("say and job.progress become thoughts", () => {
    expect(adaptToThought({ type: "say", text: "On it." })?.text).toBe("On it.");
    const p = adaptToThought({ type: "job.progress", id: "j1", text: "Fetching…" });
    expect(p?.text).toBe("Fetching…");
    expect(p?.jobId).toBe("j1");
  });

  it("job.start surfaces the goal; done/error/cancelled/action stay out", () => {
    const s = adaptToThought({ type: "job.start", id: "j1", goal: "Reading papers" });
    expect(s?.text).toBe("Reading papers");
    expect(adaptToThought({ type: "job.done", id: "j1", result: {} })).toBeNull();
    expect(adaptToThought({ type: "job.error", id: "j1", error: "x" })).toBeNull();
    expect(adaptToThought({ type: "job.cancelled", id: "j1" })).toBeNull();
    expect(adaptToThought({ type: "action", name: "open_tab", args: {} })).toBeNull();
  });

  it("today's tool status lines drift up; reply deltas and finals do not", () => {
    const t = adaptToThought({ type: "tool.started", statusLabel: "Searching the web" });
    expect(t?.text).toBe("Searching the web");
    expect(adaptToThought({ type: "tool.started", statusLabel: null })).toBeNull();
    expect(adaptToThought({ type: "agent.text_delta", step: 1, delta: "hi" } as never)).toBeNull();
    expect(adaptToThought({ type: "agent.finished", step: 1 } as never)).toBeNull();
    expect(adaptToThought({ type: "agent.error", step: 1, message: "x" } as never)).toBeNull();
  });

  it("job lifecycle tracks active ids for the orb indicator", () => {
    let ids: string[] = [];
    const off = subscribeJobs((next) => {
      ids = next;
    });
    feedThoughtEvent({ type: "job.start", id: "a", goal: "g" });
    feedThoughtEvent({ type: "job.start", id: "b", goal: "g" });
    expect(ids.sort()).toEqual(["a", "b"]);
    feedThoughtEvent({ type: "job.done", id: "a", result: {} });
    expect(ids).toEqual(["b"]);
    feedThoughtEvent({ type: "job.cancelled", id: "b" });
    expect(ids).toEqual([]);
    off();
  });
});
