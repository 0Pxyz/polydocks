import { describe, expect, test } from "bun:test";
import {
  emptyDock,
  openItem,
  closeItem,
  focusItem,
  focusByIndex,
  focusNext,
  backgroundItem,
  setActiveContext,
  registerItem,
  visibleIds,
  assignPanels,
  matchDockShortcut,
  DOCK_ACTIONS,
} from "../src/lib/dock/dockItems";

describe("dock_items single source (P0 regression)", () => {
  test("symptom 1: open 3 city items, go to map and back: same items, order, focus", () => {
    let dock = emptyDock();
    dock = { ...dock, activeContextId: "city-stoicism" };
    dock = openItem(dock, "sources", "city-stoicism");
    dock = openItem(dock, "notes", "city-stoicism");
    dock = openItem(dock, "quests", "city-stoicism");
    const beforeOrder = [...dock.order];
    const beforeFocus = dock.focusedId;
    expect(beforeFocus).toBe("quests");

    dock = setActiveContext(dock, null);
    // Map shows no city item, but records persist.
    expect(visibleIds(dock)).toEqual([]);
    expect(Object.keys(dock.items).sort()).toEqual(["notes", "quests", "sources"]);

    dock = setActiveContext(dock, "city-stoicism");
    expect([...dock.order]).toEqual(beforeOrder);
    expect(dock.focusedId).toBe(beforeFocus);
    expect(visibleIds(dock)).toEqual(["sources", "notes", "quests"]);
  });

  test("symptom 2: in map no city item appears; every visible item opens first try", () => {
    let dock = emptyDock();
    dock = { ...dock, activeContextId: "city-x" };
    dock = openItem(dock, "notes", "city-x");
    dock = openItem(dock, "maps", null);
    dock = setActiveContext(dock, null);
    const visible = visibleIds(dock);
    // Only the global map entry is visible; city notes persist hidden.
    expect(visible).toEqual(["maps"]);
    // Focusing the visible map entry works immediately.
    dock = focusItem(dock, "maps");
    expect(dock.focusedId).toBe("maps");
    // Focusing a hidden other-context item is a no-op (never inaccessible).
    const before = dock;
    dock = focusItem(dock, "notes");
    expect(dock.focusedId).toBe(before.focusedId);
  });

  test("symptom 3: close any visible item in one click; zero open-but-invisible", () => {
    let dock = emptyDock();
    dock = { ...dock, activeContextId: "city-x" };
    dock = openItem(dock, "notes", "city-x");
    expect(visibleIds(dock)).toContain("notes");
    dock = closeItem(dock, "notes");
    expect(visibleIds(dock)).not.toContain("notes");
    expect(dock.items["notes"].state).toBe("closed");
    // Closing an already-closed item is a no-op (no second click needed).
    const once = closeItem(dock, "notes");
    expect(once.items["notes"].state).toBe("closed");
  });

  test("order is never recalculated: reopen keeps registration order", () => {
    let dock = emptyDock();
    dock = { ...dock, activeContextId: "city-x" };
    dock = openItem(dock, "a", "city-x");
    dock = openItem(dock, "b", "city-x");
    dock = openItem(dock, "c", "city-x");
    expect(visibleIds(dock)).toEqual(["a", "b", "c"]);
    dock = focusItem(dock, "a");
    // Focus changes states, never the stable order.
    expect(dock.order).toEqual(["a", "b", "c"]);
    expect(visibleIds(dock)).toEqual(["a", "b", "c"]);
    // Re-registering never moves an item.
    dock = registerItem(dock, { id: "b" });
    expect(dock.order).toEqual(["a", "b", "c"]);
  });
});

describe("dock contract: focus/background never remounts", () => {
  test("focus and background only change state/panel, never order", () => {
    let dock = emptyDock();
    dock = { ...dock, activeContextId: null };
    for (const id of ["video", "notes", "chat"]) dock = openItem(dock, id, null);
    const order = [...dock.order];
    dock = focusItem(dock, "video");
    expect(dock.order).toEqual(order);
    dock = backgroundItem(dock, "notes");
    expect(dock.order).toEqual(order);
    expect(dock.items["notes"].state).toBe("background");
    // Background keeps its record (host keeps it mounted, hidden).
    expect(dock.items["notes"]).toBeDefined();
  });

  test("two panels only at width >= N; overflow stays mounted with panel null", () => {
    let dock = emptyDock();
    dock = { ...dock, activeContextId: null };
    dock = openItem(dock, "video", null);
    dock = openItem(dock, "notes", null);
    dock = openItem(dock, "chat", null);
    const wide = assignPanels(dock, 1400);
    const withPanels = Object.values(wide.items).filter((r) => r.panel !== null);
    expect(withPanels.length).toBe(2);
    expect(wide.focusedId).not.toBeNull();
    const narrow = assignPanels(dock, 800);
    const single = Object.values(narrow.items).filter((r) => r.panel !== null);
    expect(single.length).toBe(1);
    // Nothing unmounted: every record persists.
    expect(Object.keys(narrow.items).length).toBe(3);
  });
});

describe("dock actions: one registry for keyboard, REST, CLI, agent", () => {
  test("event.code drives focus 1..9 (PT and US layouts alike)", () => {
    // Shift+1 on PT may yield "!" via event.key; code stays Digit1.
    const matched = matchDockShortcut({ code: "Digit1", ctrlKey: true, shiftKey: true });
    expect(matched?.action.id).toBe("tabs.focus");
    expect(matched?.index).toBe(0);
    const ninth = matchDockShortcut({ code: "Digit9", ctrlKey: true, shiftKey: true });
    expect(ninth?.index).toBe(8);
  });

  test("arrows, W, H, 0 match by code; Mac Cmd counts as Ctrl", () => {
    expect(matchDockShortcut({ code: "ArrowRight", ctrlKey: true, shiftKey: true })?.action.id).toBe("tabs.next");
    expect(matchDockShortcut({ code: "ArrowLeft", ctrlKey: true, shiftKey: true })?.action.id).toBe("tabs.prev");
    expect(matchDockShortcut({ code: "KeyW", ctrlKey: true, shiftKey: true })?.action.id).toBe("tabs.close");
    expect(matchDockShortcut({ code: "KeyH", ctrlKey: true, shiftKey: true })?.action.id).toBe("tabs.background");
    expect(matchDockShortcut({ code: "Digit0", ctrlKey: true, metaKey: true, shiftKey: true })?.action.id).toBe(
      "chat.toggle"
    );
  });

  test("keyboard and direct calls converge (equivalence shape)", () => {
    let viaKeyboard = emptyDock();
    viaKeyboard = { ...viaKeyboard, activeContextId: null };
    for (const id of ["a", "b", "c"]) viaKeyboard = openItem(viaKeyboard, id, null);
    let viaDirect = emptyDock();
    viaDirect = { ...viaDirect, activeContextId: null };
    for (const id of ["a", "b", "c"]) viaDirect = openItem(viaDirect, id, null);
    // Ctrl+Shift+2 focuses the 2nd visible item, same as focusByIndex(1).
    const matched = matchDockShortcut({ code: "Digit2", ctrlKey: true, shiftKey: true });
    viaKeyboard = focusByIndex(viaKeyboard, matched?.index ?? 1);
    viaDirect = focusByIndex(viaDirect, 1);
    expect(viaKeyboard.focusedId).toBe(viaDirect.focusedId);
    // Next wraps identically.
    viaKeyboard = focusNext(viaKeyboard, 1);
    viaDirect = focusNext(viaDirect, 1);
    expect(viaKeyboard.focusedId).toBe(viaDirect.focusedId);
  });

  test("single registry lists every shortcut with description", () => {
    const ids = DOCK_ACTIONS.map((a) => a.id);
    for (const expected of ["tabs.focus", "tabs.next", "tabs.prev", "tabs.close", "tabs.background", "chat.toggle"]) {
      expect(ids).toContain(expected);
    }
    for (const action of DOCK_ACTIONS) {
      expect(action.description.length).toBeGreaterThan(0);
      expect(action.shortcut.code.length).toBeGreaterThan(0);
    }
  });
});
