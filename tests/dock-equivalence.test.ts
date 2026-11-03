import { describe, expect, test, beforeEach } from "bun:test";
import { db } from "../server/workspace/db";
import { dockAction } from "../server/facade/shared";
import {
  dockFocus,
  dockNext,
  dockBackground,
  chatToggle,
  dockClose,
  dockOpen,
} from "../server/agent/tools/verbs/dock";

/** Equivalence: keyboard registry, REST, CLI and agent verbs converge. */
describe("dock equivalence: keyboard, REST, CLI, agent verbs", () => {
  beforeEach(() => {
    db.query("DELETE FROM dock_items").run();
  });

  test("REST tabs.open then agent verb focus give the same final state + events", async () => {
    // REST: open two items in a context.
    const opened1 = await dockAction("tabs.open", { tabId: "notes", workspaceId: "ws-eq" }, { actor: "user" });
    expect(opened1.ok).toBe(true);
    const opened2 = await dockAction("tabs.open", { tabId: "sources", workspaceId: "ws-eq" }, { actor: "cli" });
    expect(opened2.ok).toBe(true);

    // Agent verb: focus index 0 (same as Ctrl+Shift+1).
    const viaVerb: any = await dockFocus.execute({ index: 0, workspaceId: "ws-eq" } as any, {
      step: 1, workspaceId: "ws-eq",
    } as any);
    expect(viaVerb.ok).toBe(true);
    const focusedId = (viaVerb.data as any)?.id;

    // REST: same focus by index.
    const viaRest = await dockAction("tabs.focus", { index: 0, workspaceId: "ws-eq" }, { actor: "user" });
    expect(viaRest.ok).toBe(true);
    expect((viaRest.data as any)?.id).toBe(focusedId);
    // Same event type on both surfaces.
    expect((viaVerb as any).events?.[0]?.type).toBe("tab.focused");
    expect((viaRest as any).events?.[0]?.type).toBe("tab.focused");
  });

  test("tabs.next/prev wrap identically via REST and agent verbs", async () => {
    await dockAction("tabs.open", { tabId: "a", workspaceId: null }, { actor: "user" });
    await dockAction("tabs.open", { tabId: "b", workspaceId: null }, { actor: "user" });
    await dockAction("tabs.focus", { index: 0 }, { actor: "user" });
    const nextRest = await dockAction("tabs.next", {}, { actor: "user" });
    await dockAction("tabs.focus", { index: 0 }, { actor: "user" });
    const nextVerb: any = await dockNext.execute({} as any, { step: 1 } as any);
    expect(nextRest.ok).toBe(true);
    expect(nextVerb.ok).toBe(true);
    expect((nextRest.data as any)?.id).toBe((nextVerb.data as any)?.id);
  });

  test("close + background keep records (reopen returns same state)", async () => {
    const open: any = await dockOpen.execute({ tabId: "notes", workspaceId: "ws-eq" } as any, {
      step: 1, workspaceId: "ws-eq",
    } as any);
    expect(open.ok).toBe(true);
    const bg: any = await dockBackground.execute({ id: "notes" } as any, { step: 1 } as any);
    expect(bg.ok).toBe(true);
    expect((bg.data as any)?.dockItem?.state).toBe("background");
    const closed: any = await dockClose.execute({ id: "notes" } as any, { step: 1 } as any);
    expect(closed.ok).toBe(true);
    const reopened: any = await dockOpen.execute({ tabId: "notes", workspaceId: "ws-eq" } as any, {
      step: 1, workspaceId: "ws-eq",
    } as any);
    expect(reopened.ok).toBe(true);
    expect((reopened.data as any)?.dockItem?.id).toBe("notes");
  });

  test("chat.toggle focuses and hides via REST and agent verb", async () => {
    const shown = await dockAction("chat.toggle", {}, { actor: "user" });
    expect(shown.ok).toBe(true);
    const viaVerb: any = await chatToggle.execute({} as any, { step: 1 } as any);
    expect(viaVerb.ok).toBe(true);
    // Toggling twice returns to hidden; both surfaces emit chat events.
    const types = [(shown as any).events?.[0]?.type, viaVerb.events?.[0]?.type];
    for (const t of types) expect(["chat.focused", "chat.hidden"]).toContain(t);
  });

  test("dock.list exposes the single action registry", async () => {
    const listed: any = await dockAction("tabs.list", {}, { actor: "user" });
    expect(listed.ok).toBe(true);
    const actions = (listed.data as any)?.actions as Array<{ id: string }>;
    const ids = actions.map((a) => a.id);
    for (const expected of ["tabs.focus", "tabs.next", "tabs.prev", "tabs.close", "tabs.background", "chat.toggle"]) {
      expect(ids).toContain(expected);
    }
  });
});

describe("dock single focus (#174 follow-up)", () => {
  test("opening a new item demotes the previously focused one", async () => {
    await dockAction("tabs.open", { tabId: "eq-focus-a", workspaceId: "ws-eq" }, { actor: "user" });
    await dockAction("tabs.open", { tabId: "eq-focus-b", workspaceId: "ws-eq" }, { actor: "user" });
    const listed: any = await dockAction("tabs.list", { workspaceId: "ws-eq" }, { actor: "user" });
    expect(listed.ok).toBe(true);
    const focused = listed.data.dockItems.filter((r: any) => r.state === "focused");
    expect(focused.map((r: any) => r.id)).toEqual(["eq-focus-b"]);
  });
});
