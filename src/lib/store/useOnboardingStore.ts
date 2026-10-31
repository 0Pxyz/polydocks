import { create } from "zustand";
import { platformStorage } from "@/lib/platform/storage";

const ONBOARDING_STORAGE_KEY = "polymax_onboarding_completed_v2";

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
    title: "Welcome to PolyDocks",
    subtitle: "Your personal workspace operated by an autonomous agent.",
    dockTarget: "agent",
    durationMs: 7000,
  },
  {
    id: "research",
    title: "Agents That Do Real Work",
    subtitle: "Poly searches and synthesizes primary sources via TinyFish.",
    dockTarget: "browser",
    durationMs: 9000,
  },
  {
    id: "workspace",
    title: "Your Workspace Comes Alive",
    subtitle: "Real Chromium browser and research sources mounted in parallel.",
    dockTarget: "browser",
    durationMs: 8000,
  },
  {
    id: "tools",
    title: "Your Dock, Your Tools",
    subtitle: "Poly builds and mounts custom tools directly into the dock.",
    dockTarget: "deep-work-flashcards",
    durationMs: 9000,
  },
  {
    id: "handoff",
    title: "Your Workspace, Your Rules",
    subtitle: "This is your workspace. Tell me what you want to build next.",
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
  },

  setStep: (step: OnboardingStep) => {
    const idx = ONBOARDING_STEPS.findIndex((s) => s.id === step);
    set({
      currentStep: step,
      currentStepIndex: idx >= 0 ? idx : 0,
      isOpen: step !== "idle",
      isPlaying: step !== "idle",
    });
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
  },

  completeDemo: () => {
    platformStorage.setItem(ONBOARDING_STORAGE_KEY, true);
    set({
      isOpen: false,
      isPlaying: false,
      currentStep: "idle",
      hasCompleted: true,
    });
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
  },
}));

if (typeof window !== "undefined") {
  (window as any).__onboardingStore = useOnboardingStore;
}
