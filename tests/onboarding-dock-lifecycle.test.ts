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

  it("tour steps keep creative's choreography (TinyFish research, flashcards demo)", () => {
    const byId = new Map(ONBOARDING_STEPS.map((s) => [s.id, s]));
    expect(byId.get("research")?.dockTarget).toBe("browser");
    expect(byId.get("tools")?.dockTarget).toBe("deep-work-flashcards");
    expect(byId.get("research")?.subtitle).toContain("TinyFish");
    for (const step of ONBOARDING_STEPS) {
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.subtitle.length).toBeGreaterThan(0);
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
