import { create } from "zustand";
import { platformStorage } from "@/lib/platform/storage";
import { useDockStore } from "@/lib/store/useDockStore";

const ONBOARDING_STORAGE_KEY = "polymax_onboarding_completed_v2";

/** Exported for tests: the persisted completion flag. */
export const ONBOARDING_COMPLETED_KEY = ONBOARDING_STORAGE_KEY;

/** Dock tab id that hosts the walkthrough surface. */
export const ONBOARDING_TAB_ID = "onboarding";

export type OnboardingStep =
  | "idle"
  | "intro"
  | "research"
  | "workspace"
  | "tools"
  | "handoff";

export const ONBOARDING_STEPS: {
  id: OnboardingStep;
  title: string;
  subtitle: string;
  dockTarget?: string;
  durationMs: number;
}[] = [
  {
    id: "intro",
    title: "Meet Poly",
    subtitle: "Your dock, run by an agent. Talk or type — Poly opens, arranges, and operates everything beside you.",
    dockTarget: "agent",
    durationMs: 7000,
  },
  {
    id: "research",
    title: "Real research, real browser",
    subtitle: "Poly searches the web, news, and papers — and reads them in real Chromium tabs with sources saved.",
    dockTarget: "browser",
    durationMs: 9000,
  },
  {
    id: "workspace",
    title: "Make it yours",
    subtitle: "Backgrounds and themes apply everywhere, live. Tell Poly a new look and watch the workspace follow.",
    dockTarget: "settings",
    durationMs: 8000,
  },
  {
    id: "tools",
    title: "Tools, built on demand",
    subtitle: "Ask and Poly builds a sandboxed tool straight into your dock. This tab is full of them.",
    dockTarget: "plugins",
    durationMs: 9000,
  },
  {
    id: "handoff",
    title: "Your turn",
    subtitle: "Tell Poly what to build next — research, tools, or a fresh look.",
    dockTarget: "agent",
    durationMs: 6000,
  },
];

interface OnboardingStoreState {
  isOpen: boolean;
  hasCompleted: boolean;
  isPlaying: boolean;
  currentStep: OnboardingStep;
  currentStepIndex: number;
  openOnboarding: () => void;
  closeOnboarding: () => void;
  startDemo: (replay?: boolean) => void;
  setStep: (step: OnboardingStep) => void;
  nextStep: () => void;
  prevStep: () => void;
  skipDemo: () => void;
  completeDemo: () => void;
  resetOnboarding: () => void;
}

function loadInitialStatus(): boolean {
  return platformStorage.getItem<boolean>(ONBOARDING_STORAGE_KEY, false) === true;
}

export const useOnboardingStore = create<OnboardingStoreState>((set, get) => ({
  isOpen: !loadInitialStatus(),
  hasCompleted: loadInitialStatus(),
  isPlaying: !loadInitialStatus(),
  currentStep: loadInitialStatus() ? "idle" : "intro",
  currentStepIndex: 0,

  openOnboarding: () => {
    get().startDemo(true);
  },

  closeOnboarding: () => {
    get().skipDemo();
  },

  startDemo: (replay = false) => {
    if (replay) {
      platformStorage.removeItem(ONBOARDING_STORAGE_KEY);
    }
    set({
      isOpen: true,
      isPlaying: true,
      currentStep: "intro",
      currentStepIndex: 0,
      hasCompleted: false,
    });
    // The walkthrough is a standard dock tab on every entry path
    // (first launch, agent, replay, settings): opening here covers them all.
    useDockStore.getState().openTool(ONBOARDING_TAB_ID);
  },

  setStep: (step: OnboardingStep) => {
    const idx = ONBOARDING_STEPS.findIndex((s) => s.id === step);
    set({
      currentStep: step,
      currentStepIndex: idx >= 0 ? idx : 0,
      isOpen: step !== "idle",
      isPlaying: step !== "idle",
    });
    // Stepping implies a visible tour (agent path may skip startDemo).
    if (step !== "idle") useDockStore.getState().openTool(ONBOARDING_TAB_ID);
  },

  nextStep: () => {
    const { currentStepIndex } = get();
    if (currentStepIndex < ONBOARDING_STEPS.length - 1) {
      const nextIdx = currentStepIndex + 1;
      set({
        currentStepIndex: nextIdx,
        currentStep: ONBOARDING_STEPS[nextIdx].id,
      });
    } else {
      get().completeDemo();
    }
  },

  prevStep: () => {
    const { currentStepIndex } = get();
    if (currentStepIndex > 0) {
      const prevIdx = currentStepIndex - 1;
      set({
        currentStepIndex: prevIdx,
        currentStep: ONBOARDING_STEPS[prevIdx].id,
      });
    }
  },

  skipDemo: () => {
    platformStorage.setItem(ONBOARDING_STORAGE_KEY, true);
    set({
      isOpen: false,
      isPlaying: false,
      currentStep: "idle",
      hasCompleted: true,
    });
    // Closing removes the tab from the dock; the completed flag stops
    // any auto-reopen. Only an explicit replay or request brings it back.
    useDockStore.getState().closeTool(ONBOARDING_TAB_ID);
  },

  completeDemo: () => {
    platformStorage.setItem(ONBOARDING_STORAGE_KEY, true);
    set({
      isOpen: false,
      isPlaying: false,
      currentStep: "idle",
      hasCompleted: true,
    });
    useDockStore.getState().closeTool(ONBOARDING_TAB_ID);
  },

  resetOnboarding: () => {
    platformStorage.removeItem(ONBOARDING_STORAGE_KEY);
    set({
      isOpen: true,
      isPlaying: true,
      currentStep: "intro",
      currentStepIndex: 0,
      hasCompleted: false,
    });
    useDockStore.getState().openTool(ONBOARDING_TAB_ID);
  },
}));

if (typeof window !== "undefined") {
  (window as any).__onboardingStore = useOnboardingStore;
}

// First launch opens the walkthrough tab (no store action runs at import,
// so the dock sync happens here, once, in the browser only). Completed
// workspaces skip it via the persisted flag above.
if (typeof window !== "undefined" && !loadInitialStatus()) {
  queueMicrotask(() => {
    useDockStore.getState().openTool(ONBOARDING_TAB_ID);
  });
}
