import { describe, it, expect, beforeEach } from "bun:test";
import {
  useTabHostStore,
  resetTabHostForTests,
  LIVE_TAB_LIMIT,
} from "./tabHostStore";

describe("tab host store: only the host controls the lifecycle", () => {
  beforeEach(() => {
    resetTabHostForTests();
  });

  it("open A, B, C and back to A gives 0 remounts in A", () => {
    const host = useTabHostStore.getState();
    host.openTab("A", "plugin");
    host.openTab("B", "plugin");
    host.openTab("C", "plugin");
    host.activateTab("A");
    const tabs = useTabHostStore.getState().tabs;
    expect(tabs["A"].mountCount).toBe(1);
    expect(tabs["B"].mountCount).toBe(1);
    expect(tabs["C"].mountCount).toBe(1);
    expect(Object.values(tabs).every((t) => t.status === "live")).toBe(true);
  });

  it("hibernates the oldest live plugin tab above the limit", () => {
    const host = useTabHostStore.getState();
    for (let i = 0; i < LIVE_TAB_LIMIT + 1; i++) {
      host.openTab(`tab-${i}`, "plugin");
    }
    const tabs = useTabHostStore.getState().tabs;
    const live = Object.values(tabs).filter((t) => t.status === "live");
    expect(live.length).toBe(LIVE_TAB_LIMIT);
    expect(tabs["tab-0"].status).toBe("hibernated");
    expect(tabs[`tab-${LIVE_TAB_LIMIT}`].status).toBe("live");
  });

  it("restoring a hibernated tab remounts once and keeps the limit", () => {
    const host = useTabHostStore.getState();
    for (let i = 0; i < LIVE_TAB_LIMIT + 1; i++) {
      host.openTab(`tab-${i}`, "plugin");
    }
    host.openTab("tab-0", "plugin");
    const tabs = useTabHostStore.getState().tabs;
    expect(tabs["tab-0"].status).toBe("live");
    expect(tabs["tab-0"].mountCount).toBe(2);
    expect(Object.values(tabs).filter((t) => t.status === "live").length).toBe(LIVE_TAB_LIMIT);
  });

  it("a task registered on a hidden tab completes; hibernation interrupts it", () => {
    const host = useTabHostStore.getState();
    host.openTab("A", "plugin");
    host.registerTask("A", { id: "t1", label: "Export CSV" });
    host.openTab("B", "plugin");
    // B is active, A hidden: the task still completes and is queryable.
    host.updateTask("t1", "done");
    expect(useTabHostStore.getState().tasksForTab("A")[0].status).toBe("done");

    host.registerTask("A", { id: "t2", label: "Long upload" });
    host.hibernateTab("A");
    expect(useTabHostStore.getState().tasksForTab("A").find((t) => t.id === "t2")?.status).toBe(
      "interrupted"
    );
  });

  it("explicit close destroys the runtime entry (persisted tab state survives separately)", () => {
    const host = useTabHostStore.getState();
    host.openTab("A", "plugin");
    host.closeTab("A");
    expect(useTabHostStore.getState().tabs["A"]).toBeUndefined();
    host.openTab("A", "plugin");
    expect(useTabHostStore.getState().tabs["A"].mountCount).toBe(1);
  });
});
