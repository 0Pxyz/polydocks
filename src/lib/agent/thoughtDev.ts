/**
 * Dev-only fake emitter: drives the ThoughtStream (including two parallel
 * fake jobs) without any backend. Loaded only when `?thought-demo=1` is set
 * or `window.__thoughtDemo()` is called. Never imported in production paths.
 */

import { feedThoughtEvent } from "./thoughtStream";

const JOBS = [
  { id: "demo-a", goal: "Reading three papers on raft", steps: ["Searching the web", "Fetching paper 1 of 3", "Fetching paper 2 of 3", "Synthesizing notes"] },
  { id: "demo-b", goal: "Comparing two neighbourhood guides", steps: ["Searching the web", "Fetching guide A", "Fetching guide B", "Timing the comparison"] },
];

export function isThoughtDemoEnabled(): boolean {
  try {
    return (
      typeof window !== "undefined" &&
      (window.location.search.includes("thought-demo=1") ||
        (window as unknown as { __thoughtDemoArmed?: boolean }).__thoughtDemoArmed === true)
    );
  } catch {
    return false;
  }
}

export function emitFakeThoughtDemo(): void {
  feedThoughtEvent({ type: "say", text: "On it — two things at once." });
  for (const job of JOBS) {
    feedThoughtEvent({ type: "job.start", id: job.id, goal: job.goal });
  }
  const max = Math.max(...JOBS.map((j) => j.steps.length));
  for (let i = 0; i < max; i++) {
    for (const job of JOBS) {
      const step = job.steps[i];
      if (!step) continue;
      const at = 900 * (i * JOBS.length + JOBS.indexOf(job));
      window.setTimeout(() => {
        feedThoughtEvent({ type: "job.progress", id: job.id, text: step });
      }, at);
    }
  }
  window.setTimeout(() => {
    feedThoughtEvent({ type: "job.done", id: "demo-a", result: {} });
    feedThoughtEvent({ type: "thought", text: "Raft notes saved.", jobId: "demo-a" });
  }, 900 * max * JOBS.length + 400);
  window.setTimeout(() => {
    feedThoughtEvent({ type: "job.done", id: "demo-b", result: {} });
    feedThoughtEvent({ type: "thought", text: "Comparison ready below.", jobId: "demo-b" });
  }, 900 * max * JOBS.length + 1200);
}
