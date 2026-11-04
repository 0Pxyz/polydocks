import { describe, expect, it } from "bun:test";

/**
 * Step terminal-wins (#stuck-steps): a redelivered tool.start (reconnect
 * replay, duplicate frame) must never flip a done/error step back to
 * running. Reproduces the stuck "Working…" rows on failed background jobs:
 * card said Failed while its steps still spun until a manual refresh.
 */
import { mergeStep } from "../src/lib/agent/conversationStore";
import type { AgentStep } from "../src/lib/agent/conversationStore";

const running = (id: string): AgentStep => ({ id, kind: "think", label: "Working…", status: "running", at: 1 });
const done = (id: string): AgentStep => ({ id, kind: "think", label: "Working…", status: "done", at: 2 });
const errored = (id: string): AgentStep => ({ id, kind: "think", label: "Working…", status: "error", at: 2 });

describe("mergeStep terminal-wins", () => {
  it("creates the step when there is none", () => {
    expect(mergeStep(undefined, running("s1"))).toEqual(running("s1"));
  });

  it("a redelivered running row never resurrects an errored step", () => {
    expect(mergeStep(errored("s1"), running("s1"))).toBeNull();
  });

  it("a redelivered running row never resurrects a done step", () => {
    expect(mergeStep(done("s1"), running("s1"))).toBeNull();
  });

  it("forward progress still applies (running -> done)", () => {
    expect(mergeStep(running("s1"), done("s1"))).toEqual(done("s1"));
  });
});
