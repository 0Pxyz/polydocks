/**
 * Loop → durable-stream bridge contract (#360).
 *
 * One transport carries every reactive UI event (tool progress, plugin
 * lifecycle, dock/theme/reader side-effects, source saves) from the agent
 * loop to the SSE stream. Two holes broke it: the loop dropped bus-side
 * capability events, and the background executor bridged only a subset.
 * Both directions now share these predicates so interactive and
 * background turns carry the same stream.
 */

/** Bus-side duplicates of loop-owned events: the loop emits its own
 * tool.start/tool.done around every call, so the bus copies stay muted.
 * Everything else (approval.requested, framework-emitted capability
 * events like source.added) travels up. */
const BUS_DUPLICATES = new Set(["tool.start", "tool.done"]);

/** Bus traffic the loop forwards (denylist: only exact duplicates die). */
export function shouldForwardBusEvent(type: string): boolean {
  return !BUS_DUPLICATES.has(type);
}

/** Loop events with no durable-stream consumer: heartbeats and raw text
 * deltas (the interactive path renders those as thinking/progress UI,
 * never rows; background turns have no placeholder for them). */
const BACKGROUND_SKIP = new Set(["agent.heartbeat", "agent.text_delta"]);

/**
 * Background parity bridge (#360): a background synthesis must carry the
 * same reactive stream as an interactive turn — progress (tool.start /
 * tool.done), UI side-effects (tray.open, dock.*, browser.open,
 * source.added, sandbox.preview, theme.apply) and lifecycle (plugin.*).
 */
export function shouldBridgeLoopEvent(type: string): boolean {
  return !BACKGROUND_SKIP.has(type);
}
