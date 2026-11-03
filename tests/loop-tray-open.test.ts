import { describe, it, expect } from "bun:test";
import { selectTrayOpenPayload } from "../server/agent/loopEvents";

/**
 * tray.open payload preference (#402): the loop must forward the facade
 * PARAMS ({tabId, noteId}), never the result envelope — the client
 * resolves the dock id from payload.tabId, and the envelope carries
 * neither a tab id nor (after the wire fix) any id at all.
 */
describe("selectTrayOpenPayload (#402)", () => {
  it("prefers the facade tray.open event payload over the envelope", () => {
    const out = selectTrayOpenPayload({
      ok: true,
      data: { dockItem: { id: "notes" } },
      events: [{ type: "tray.open", payload: { tabId: "notes", noteId: "note_1", workspaceId: "default" } }],
    });
    expect(out).toEqual({ tabId: "notes", noteId: "note_1", workspaceId: "default" });
  });

  it("falls back to the raw result when no facade event exists", () => {
    const out = selectTrayOpenPayload({ ok: true, custom: 1 });
    expect(out).toEqual({ ok: true, custom: 1 });
  });

  it("falls back when events carry no tray.open", () => {
    const out = selectTrayOpenPayload({ ok: true, events: [{ type: "other", payload: {} }] });
    expect(out).toEqual({ ok: true, events: [{ type: "other", payload: {} }] });
  });
});
