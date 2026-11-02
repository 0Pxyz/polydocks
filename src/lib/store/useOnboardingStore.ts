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
  /** Center-stage narration line (the video flow). Shown under the orb. */
  narration: string;
  dockTarget?: string;
  durationMs: number;
}[] = [
  {
    id: "intro",
    title: "Welcome to PolyDocks",
    subtitle: "Your personal workspace operated by an autonomous agent.",
    narration: "Welcome to your new workspace. Let me show you what we can do together.",
    dockTarget: "agent",
    durationMs: 7000,
  },
  {
    id: "research",
    title: "Agents That Do Real Work",
    subtitle: "Poly searches and synthesizes primary sources via TinyFish.",
    narration: "Watch the dock: querying primary sources via TinyFish…",
    dockTarget: "browser",
    durationMs: 9000,
  },
  {
    id: "workspace",
    title: "Your Workspace Comes Alive",
    subtitle: "Real Chromium browser and research sources mounted in parallel.",
    narration: "Opening real Chromium browser and research notes side by side…",
    dockTarget: "browser",
    durationMs: 8000,
  },
  {
    id: "tools",
    title: "Your Dock, Your Tools",
    subtitle: "Poly builds and mounts custom tools directly into the dock.",
    narration: "Building and mounting a live Bitcoin price viewer into your dock…",
    dockTarget: "bitcoin-viewer",
    durationMs: 9000,
  },
  {
    id: "handoff",
    title: "Your Workspace, Your Rules",
    subtitle: "This is your workspace. Tell me what you want to build next.",
    narration: "This is your workspace. Tell me what you want to build next.",
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
      currentStep: "intro",
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

  resetOnboarding: () => {
    platformStorage.removeItem(ONBOARDING_STORAGE_KEY);
    set({
      isOpen: true,
      isPlaying: true,
      currentStep: "intro",
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
