import { describe, it, expect, beforeEach } from "bun:test";
import { platformStorage } from "@/lib/platform/storage";
import { useTabStateStore, clearTabState, resetTabStateForTests } from "./useTabState";

const KEY = "polydocks-tab-state";

describe("useTabState store: namespaced, persisted keys", () => {
  beforeEach(() => {
    resetTabStateForTests();
    platformStorage.removeItem(KEY);
  });

  it("persists keys through the platform storage (survives hibernate + reload)", () => {
    useTabStateStore.getState().setKey("tab-a::draft", "hello");
    const raw = platformStorage.getItem<Record<string, unknown>>(KEY);
    expect(raw?.["tab-a::draft"]).toBe("hello");
  });

  it("keys are namespaced per tab", () => {
    useTabStateStore.getState().setKey("tab-a::filter", "videos");
    expect(useTabStateStore.getState().values["tab-b::filter"]).toBeUndefined();
  });

  it("clearTabState drops one tab without touching the others", () => {
    useTabStateStore.getState().setKey("tab-a::filter", "videos");
    useTabStateStore.getState().setKey("tab-b::filter", "articles");
    clearTabState("tab-a");
    const values = useTabStateStore.getState().values;
    expect(values["tab-a::filter"]).toBeUndefined();
    expect(values["tab-b::filter"]).toBe("articles");
  });
});
