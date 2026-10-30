import { describe, expect, test, beforeEach } from "bun:test";
import { useDockStore } from "../src/lib/store/useDockStore";
import { DEFAULT_PINNED_IDS } from "../src/lib/dock/dockModel";

const known = new Set(["maps", "agent", "browser", "notes", "gtm-feed", "flashcards"]);

describe("dock store directive layer", () => {
  beforeEach(() => {
    useDockStore.getState().resetDock();
  });

  test("starts from the curated default pins", () => {
    expect(useDockStore.getState().pinnedToolIds).toEqual(DEFAULT_PINNED_IDS);
    expect(useDockStore.getState().openIds).toEqual([]);
  });

  test("pin and open flow through the same layer the agent uses", () => {
    const pin = useDockStore.getState().applyDirective({ op: "pin", id: "gtm-feed" }, known);
    expect(pin.ok).toBe(true);
    expect(useDockStore.getState().pinnedToolIds).toContain("gtm-feed");

    const open = useDockStore.getState().applyDirective({ op: "open", id: "gtm-feed" }, known);
    expect(open.ok).toBe(true);
    expect(useDockStore.getState().openIds[0]).toBe("gtm-feed");
  });

  test("close removes from open but keeps the pin", () => {
    useDockStore.getState().applyDirective({ op: "pin", id: "gtm-feed" }, known);
    useDockStore.getState().applyDirective({ op: "open", id: "gtm-feed" }, known);
    const closed = useDockStore.getState().applyDirective({ op: "close", id: "gtm-feed" }, known);
    expect(closed.ok).toBe(true);
    expect(useDockStore.getState().openIds).not.toContain("gtm-feed");
    expect(useDockStore.getState().pinnedToolIds).toContain("gtm-feed");
  });

  test("unpin keeps the tool open when it was open", () => {
    useDockStore.getState().applyDirective({ op: "pin", id: "gtm-feed" }, known);
    useDockStore.getState().applyDirective({ op: "open", id: "gtm-feed" }, known);
    const unpinned = useDockStore.getState().applyDirective({ op: "unpin", id: "gtm-feed" }, known);
    expect(unpinned.ok).toBe(true);
    expect(useDockStore.getState().pinnedToolIds).not.toContain("gtm-feed");
    expect(useDockStore.getState().openIds).toContain("gtm-feed");
  });

  test("unknown and system ids fail with a visible message", () => {
    const unknown = useDockStore.getState().applyDirective({ op: "pin", id: "nope" }, known);
    expect(unknown.ok).toBe(false);
    expect(unknown.message.length).toBeGreaterThan(0);

    const system = useDockStore.getState().applyDirective({ op: "unpin", id: "agent" }, known);
    expect(system.ok).toBe(false);
    expect(system.message.length).toBeGreaterThan(0);

    // Maps is an optional plugin now: unpinning it succeeds.
    const maps = useDockStore.getState().applyDirective({ op: "unpin", id: "maps" }, known);
    expect(maps.ok).toBe(true);
  });

  test("legacy pin/unpin helpers still work and persist order", () => {
    useDockStore.getState().pinTool("gtm-feed");
    expect(useDockStore.getState().pinnedToolIds).toEqual([...DEFAULT_PINNED_IDS, "gtm-feed"]);
    useDockStore.getState().unpinTool("agent");
    expect(useDockStore.getState().pinnedToolIds).not.toContain("agent");
  });
});
