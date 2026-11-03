import { describe, it, expect } from "bun:test";
import { adaptBackendEvent } from "../src/lib/agent/events";

/**
 * Note deep-link contract (#402): a tray.open carrying a noteId adapts to
 * a dock.open_experience with the same noteId — the one field every entry
 * point (palette row, agent dock.open, dock focus) funnels through.
 */
describe("note deep-link adaptation (#402)", () => {
  it("carries noteId from tray.open to dock.open_experience", () => {
    const ev = adaptBackendEvent({
      type: "tray.open",
      step: 1,
      payload: { tabId: "notes", noteId: "note_abc123" },
    });
    expect(ev?.type).toBe("dock.open_experience");
    if (ev?.type !== "dock.open_experience") return;
    expect(ev.experienceId).toBe("notes");
    expect(ev.noteId).toBe("note_abc123");
  });

  it("leaves noteId undefined when the payload has none", () => {
    const ev = adaptBackendEvent({
      type: "tray.open",
      step: 1,
      payload: { tabId: "plugins" },
    });
    expect(ev?.type).toBe("dock.open_experience");
    if (ev?.type !== "dock.open_experience") return;
    expect(ev.experienceId).toBe("plugins");
    expect(ev.noteId).toBeUndefined();
  });

  it("never resolves a dock id from a stray numeric payload id (#402)", () => {
    // Envelope-shaped payloads carry no tab id; the row id must not leak
    // in as one (the wire no longer injects it, and the adapter only
    // reads tabId here).
    const ev = adaptBackendEvent({
      type: "tray.open",
      step: 1,
      payload: { ok: true, data: {} },
    });
    expect(ev?.type).toBe("dock.open_experience");
    if (ev?.type !== "dock.open_experience") return;
    expect(ev.experienceId).toBe("");
  });
});
