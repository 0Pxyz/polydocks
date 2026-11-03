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
  | "home"
  | "customize"
  | "research"
  | "breathe"
  | "coin"
  | "focus"
  | "handoff";

export const ONBOARDING_STEPS: {
  id: OnboardingStep;
  title: string;
  subtitle: string;
  /** Center-stage narration line (the video flow). Shown under the orb. */
  narration: string;
  dockTarget?: string;
  durationMs: number;
}[] = [
  {
    id: "home",
    title: "Home Screen & Dock",
    subtitle: "Your personal workspace operated by an autonomous agent.",
    narration: "Welcome to your workspace. This is Poly, and this is your dock.",
    dockTarget: "agent",
    durationMs: 7000,
  },
  {
    id: "customize",
    title: "Make It Yours",
    subtitle: "Theme tokens adapt live; backgrounds persist across restarts.",
    narration: "Change the theme to match this background — everything follows.",
    dockTarget: "settings",
    durationMs: 8000,
  },
  {
    id: "research",
    title: "Deep Web Research via TinyFish",
    subtitle: "Poly searches and synthesizes primary sources via TinyFish.",
    narration: "Watch the dock: querying primary sources via TinyFish…",
    dockTarget: "browser",
    durationMs: 9000,
  },
  {
    id: "breathe",
    title: "Poly Builds: Box Breathing",
    subtitle: "Live code generation, mounted straight into the dock.",
    narration: "Poly builds a breathing exercise plugin — live, in your dock.",
    dockTarget: "agent",
    durationMs: 9000,
  },
  {
    id: "coin",
    title: "Poly Builds: Decision Coin",
    subtitle: "User input, animation, and durable flip history.",
    narration: "A decision coin with a flip animation and a history that persists.",
    dockTarget: "agent",
    durationMs: 9000,
  },
  {
    id: "focus",
    title: "Poly Builds: Focus Timer",
    subtitle: "Keeps counting in the background; restores on return.",
    narration: "A focus timer that survives tab switches and restores on return.",
    dockTarget: "agent",
    durationMs: 9000,
  },
  {
    id: "handoff",
    title: "Your Workspace, Your Rules",
    subtitle: "Personalized theme, research feed, and new plugins live in the dock.",
    narration: "This is your workspace. Tell me what you want to build next.",
    dockTarget: "agent",
    durationMs: 6000,
  },
];

/**
 * Scripted composer drafts the tour pre-fills per build step (#373): the
 * walkthrough demonstrates the feature instead of an empty chat, and the
 * user still sends (consent-preserving — the tour never auto-submits).
 * Steps without an entry leave the draft untouched.
 */
export const ONBOARDING_STEP_PROMPTS: Partial<Record<OnboardingStep, string>> = {
  breathe:
    "Build me a breathing exercise plugin: a circle that expands and contracts on a 4-4-4-4 box breathing cycle with start/pause, a round counter, and a calm dark design. Call it Box Breathing.",
  coin: "Build me a decision coin plugin: a coin flipper with a flip animation and a timestamped history that persists. Call it Decision Coin.",
  focus:
    "Build me a focus timer plugin: a 25-minute countdown that keeps counting in the background and restores on return. Call it Focus Timer.",
};

interface OnboardingStoreState {
  isOpen: boolean;
  hasCompleted: boolean;
  isPlaying: boolean;
  currentStep: OnboardingStep;
  currentStepIndex: number;
  /** User-paused (pill or tab controls). Stops auto-advance, keeps the tour open. */
  paused: boolean;
  setPaused: (paused: boolean) => void;
  openOnboarding: () => void;
  closeOnboarding: () => void;
  startDemo: (replay?: boolean) => void;
  setStep: (step: OnboardingStep) => void;
  nextStep: () => void;
  prevStep: () => void;
  skipDemo: () => void;
  completeDemo: () => void;
  /** Backward-compat alias for completeDemo (older tests/callers). */
  completeOnboarding: () => void;
  resetOnboarding: () => void;
}

function loadInitialStatus(): boolean {
  return platformStorage.getItem<boolean>(ONBOARDING_STORAGE_KEY, false) === true;
}

export const useOnboardingStore = create<OnboardingStoreState>((set, get) => ({
  isOpen: !loadInitialStatus(),
  hasCompleted: loadInitialStatus(),
  isPlaying: !loadInitialStatus(),
  currentStep: loadInitialStatus() ? "idle" : "home",
  currentStepIndex: 0,
  paused: false,

  setPaused: (paused: boolean) => {
    set({ paused });
  },

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
      currentStep: "home",
      currentStepIndex: 0,
      hasCompleted: false,
      paused: false,
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

  completeOnboarding: () => {
    get().completeDemo();
  },

  resetOnboarding: () => {
    platformStorage.removeItem(ONBOARDING_STORAGE_KEY);
    set({
      isOpen: true,
      isPlaying: true,
      currentStep: "home",
      currentStepIndex: 0,
      hasCompleted: false,
      paused: false,
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
