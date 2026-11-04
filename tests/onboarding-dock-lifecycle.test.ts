import { describe, expect, it, beforeEach } from "bun:test";
import { platformStorage } from "../src/lib/platform/storage";
import {
  useOnboardingStore,
  ONBOARDING_COMPLETED_KEY,
  ONBOARDING_STEPS,
  ONBOARDING_TAB_ID,
} from "../src/lib/store/useOnboardingStore";
import { useDockStore } from "../src/lib/store/useDockStore";
import { onboardingIntentFromTool } from "../src/lib/agent/onboardingBridge";

/**
 * Onboarding dock lifecycle (#250 follow-up): the walkthrough is a
 * standard dock tab on every entry path; closing removes the tab, marks
 * completion, and never reopens on its own; replay clears the flag.
 */
describe("onboarding dock lifecycle", () => {
  beforeEach(() => {
    platformStorage.removeItem(ONBOARDING_COMPLETED_KEY);
    useDockStore.getState().closeTool(ONBOARDING_TAB_ID);
    useOnboardingStore.setState({
      isOpen: false,
      hasCompleted: false,
      isPlaying: false,
      currentStep: "idle",
      currentStepIndex: 0,
      paused: false,
    });
  });

  it("startDemo opens the walkthrough tab and clears the completed flag", () => {
    platformStorage.setItem(ONBOARDING_COMPLETED_KEY, true);
    useOnboardingStore.getState().startDemo(true);
    expect(useOnboardingStore.getState().isOpen).toBe(true);
    expect(useDockStore.getState().openIds).toContain(ONBOARDING_TAB_ID);
    expect(platformStorage.getItem(ONBOARDING_COMPLETED_KEY, false)).toBe(false);
  });

  it("skipDemo closes the tab, marks completion, and stays closed (reload-safe)", () => {
    useOnboardingStore.getState().startDemo(true);
    expect(useDockStore.getState().openIds).toContain(ONBOARDING_TAB_ID);
    useOnboardingStore.getState().skipDemo();
    expect(useDockStore.getState().openIds).not.toContain(ONBOARDING_TAB_ID);
    expect(useOnboardingStore.getState().isOpen).toBe(false);
    // A fresh load reads the persisted flag: completed → stays closed.
    expect(platformStorage.getItem(ONBOARDING_COMPLETED_KEY, false)).toBe(true);
  });

  it("completeDemo behaves like skip for the dock tab", () => {
    useOnboardingStore.getState().startDemo(true);
    useOnboardingStore.getState().completeDemo();
    expect(useDockStore.getState().openIds).not.toContain(ONBOARDING_TAB_ID);
    expect(platformStorage.getItem(ONBOARDING_COMPLETED_KEY, false)).toBe(true);
  });

  it("every entry path opens the tab: openOnboarding, setStep, replay", () => {
    useOnboardingStore.getState().openOnboarding();
    expect(useDockStore.getState().openIds).toContain(ONBOARDING_TAB_ID);

    useOnboardingStore.getState().skipDemo();
    useOnboardingStore.getState().setStep("research");
    expect(useDockStore.getState().openIds).toContain(ONBOARDING_TAB_ID);
  });

  it("pause is store-owned: replay unpauses a fresh run", () => {
    useOnboardingStore.getState().skipDemo();
    useOnboardingStore.getState().setPaused(true);
    expect(useOnboardingStore.getState().paused).toBe(true);
    useOnboardingStore.getState().startDemo(true);
    expect(useOnboardingStore.getState().paused).toBe(false);
  });

  it("tour steps follow the demo flow with no unmapped surfaces (#368)", () => {
    const byId = new Map(ONBOARDING_STEPS.map((s) => [s.id, s]));
    expect(ONBOARDING_STEPS.map((s) => s.id)).toEqual([
      "home",
      "customize",
      "research",
      "read",
      "build",
      "remember",
      "handoff",
    ]);
    expect(byId.get("customize")?.dockTarget).toBe("agent");
    expect(byId.get("research")?.title).toContain("TinyFish");
    // Operative stages focus the agent chat (the work happens there) and
    // keep the bottom sheet visible; they never target a plugin id that
    // may not exist — an unmapped target renders the blank-void fallback.
    for (const id of ["customize", "research", "read", "build", "remember", "handoff"] as const) {
      expect(["agent", "plugins"]).toContain(byId.get(id)?.dockTarget);
    }
    for (const step of ONBOARDING_STEPS) {
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.narration.length).toBeGreaterThan(0);
      // No subtitle: the pill shows title + counter only (truncated
      // descriptions added nothing next to the kind chips).
      expect("subtitle" in step).toBe(false);
    }
  });
});

describe("onboarding agent bridge", () => {
  it("detects invoke_capability and cap.* onboarding calls", () => {
    expect(onboardingIntentFromTool("invoke_capability", { id: "onboarding.start", input: { replay: true } })).toEqual({
      action: "start",
      replay: true,
    });
    expect(onboardingIntentFromTool("cap.onboarding.step", { stepId: "research" })).toEqual({
      action: "step",
      step: "research",
    });
    expect(onboardingIntentFromTool("invoke_capability", { id: "onboarding.replay", input: {} })).toEqual({
      action: "replay",
    });
    expect(onboardingIntentFromTool("cap.onboarding.skip", {})).toEqual({ action: "skip" });
  });

  it("returns null for anything else (never a false open)", () => {
    expect(onboardingIntentFromTool("dock.open", { tabId: "browser" })).toBeNull();
    expect(onboardingIntentFromTool("invoke_capability", { id: "sources.add", input: {} })).toBeNull();
    expect(onboardingIntentFromTool("cap.onboarding.step", { stepId: "nope" })).toBeNull();
    expect(onboardingIntentFromTool("cap.onboarding.bogus", {})).toBeNull();
    expect(onboardingIntentFromTool("invoke_capability", {})).toBeNull();
  });
});
