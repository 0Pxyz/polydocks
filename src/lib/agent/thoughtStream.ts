/**
 * Thought-stream event contract + tiny bus + pure queue logic.
 *
 * Provider-agnostic: the stream only knows these events, never models or
 * the SSE wire format. `adaptToThought` converts today's UI events
 * (`tool.started` status lines) and tomorrow's dispatcher events
 * (`say`, `job.*`) into fading thought lines. Final results never enter
 * the stream — they belong in cards or the bottom sheet.
 */

export type AgentEvent =
  | { type: "say"; text: string }
  | { type: "thought"; text: string; jobId?: string; level?: "dispatcher" | "worker" }
  | { type: "action"; name: string; args: Record<string, unknown> }
  | { type: "job.start"; id: string; goal: string; worker?: string }
  | { type: "job.progress"; id: string; text: string }
  | { type: "job.done"; id: string; result: object }
  | { type: "job.error"; id: string; error: string }
  | { type: "job.cancelled"; id: string };

export interface ThoughtLine {
  id: number;
  text: string;
  jobId?: string;
  level?: "dispatcher" | "worker";
  at: number;
}

/** Visible lines cap: older lines leave the viewport and the DOM. */
export const MAX_VISIBLE_LINES = 4;
/** Minimum gap between line starts so text stays readable. */
export const MIN_LINE_GAP_MS = 1200;

let nextId = 1;

export function makeThoughtLine(
  text: string,
  opts?: { jobId?: string; level?: "dispatcher" | "worker"; at?: number }
): ThoughtLine {
  return {
    id: nextId++,
    text: text.trim().slice(0, 140),
    jobId: opts?.jobId,
    level: opts?.level,
    at: opts?.at ?? Date.now(),
  };
}

/** Append a line, keeping at most MAX_VISIBLE_LINES (oldest pruned). Pure. */
export function pushLine(lines: ThoughtLine[], line: ThoughtLine): ThoughtLine[] {
  const next = [...lines, line];
  return next.length > MAX_VISIBLE_LINES ? next.slice(next.length - MAX_VISIBLE_LINES) : next;
}

/** Rise duration shrinks as the queue grows (never unreadable, never stuck). */
export function riseDurationMs(queueLen: number): number {
  if (queueLen <= 1) return 6000;
  if (queueLen === 2) return 4500;
  if (queueLen === 3) return 3500;
  return 2500;
}

/** Subtle per-job variation without labels: stable opacity bucket per job. */
export function jobOpacity(jobId?: string): number {
  if (!jobId) return 1;
  let h = 0;
  for (let i = 0; i < jobId.length; i++) h = (h * 31 + jobId.charCodeAt(i)) >>> 0;
  return 0.75 + (h % 26) / 100;
}

export interface UIThoughtSource {
  type: string;
  id?: string;
  statusLabel?: string | null;
  text?: string;
  jobId?: string;
  goal?: string;
  level?: "dispatcher" | "worker";
}

/**
 * Convert a bus event into a fading thought line, or null when the event
 * carries persistent content (finals, errors, streaming reply text) that
 * must land in cards/sheet instead.
 */
export function adaptToThought(event: AgentEvent | UIThoughtSource): ThoughtLine | null {
  switch (event.type) {
    case "say": {
      const text = event.text ?? "";
      return text.trim() ? makeThoughtLine(text) : null;
    }
    case "thought": {
      const text = event.text ?? "";
      return text.trim()
        ? makeThoughtLine(text, { jobId: event.jobId, level: event.level })
        : null;
    }
    case "job.start": {
      const goal = event.goal ?? "";
      return goal.trim() ? makeThoughtLine(goal, { jobId: event.id }) : null;
    }
    case "job.progress": {
      const text = event.text ?? "";
      return text.trim() ? makeThoughtLine(text, { jobId: event.id }) : null;
    }
    case "job.done":
    case "job.error":
    case "job.cancelled":
    case "action":
      return null;
    default: {
      // Today's UI vocabulary: tool status lines drift up; everything else
      // (reply deltas, finals, errors) stays in the sheet.
      const src = event as UIThoughtSource;
      if (src.type === "tool.started" && src.statusLabel) {
        return makeThoughtLine(src.statusLabel, { jobId: src.jobId });
      }
      return null;
    }
  }
}

type ThoughtListener = (line: ThoughtLine) => void;

const listeners = new Set<ThoughtListener>();
const activeJobs = new Set<string>();
const jobListeners = new Set<(ids: string[]) => void>();

function notifyJobs(): void {
  const ids = [...activeJobs];
  for (const fn of jobListeners) {
    try {
      fn(ids);
    } catch {
      // A broken subscriber must never break the bus.
    }
  }
}

export function subscribeThoughts(fn: ThoughtListener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Active background job ids (job.start adds, done/error/cancelled remove). */
export function subscribeJobs(fn: (ids: string[]) => void): () => void {
  jobListeners.add(fn);
  fn([...activeJobs]);
  return () => {
    jobListeners.delete(fn);
  };
}

function broadcast(line: ThoughtLine): void {
  for (const fn of listeners) {
    try {
      fn(line);
    } catch {
      // A broken subscriber must never break the bus.
    }
  }
}

/** Dev + agent API: push a short status line into the stream. */
export function pushThought(text: string, opts?: { jobId?: string; level?: "dispatcher" | "worker" }): void {
  if (!text.trim()) return;
  broadcast(makeThoughtLine(text, opts));
}

/** Feed a normalized UI/agent event through the adapter into the stream. */
export function feedThoughtEvent(event: AgentEvent | UIThoughtSource): void {
  if (event.type === "job.start") {
    const id = (event as { id?: unknown }).id;
    if (typeof id === "string" && id) {
      activeJobs.add(id);
      notifyJobs();
    }
  } else if (event.type === "job.done" || event.type === "job.error" || event.type === "job.cancelled") {
    const id = (event as { id?: unknown }).id;
    if (typeof id === "string" && id && activeJobs.delete(id)) notifyJobs();
  }
  const line = adaptToThought(event);
  if (line) broadcast(line);
}
