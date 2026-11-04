import { create } from "zustand";
import { platformStorage } from "@/lib/platform/storage";
import { useDockStore } from "@/lib/store/useDockStore";

const ONBOARDING_STORAGE_KEY = "polydocks_onboarding_completed_v2";

/** Exported for tests: the persisted completion flag. */
export const ONBOARDING_COMPLETED_KEY = ONBOARDING_STORAGE_KEY;

/** Dock tab id that hosts the walkthrough surface. */
export const ONBOARDING_TAB_ID = "onboarding";

export type OnboardingStep =
  | "idle"
  | "home"
  | "customize"
  | "research"
  | "read"
  | "build"
  | "remember"
  | "handoff";

export const ONBOARDING_STEPS: {
  id: OnboardingStep;
  title: string;
  /** Center-stage narration line (the video flow). Shown under the orb. */
  narration: string;
  dockTarget?: string;
  durationMs: number;
}[] = [
  {
    id: "home",
    title: "Meet Poly + Your Dock",
    narration: "Meet Poly. Jump tools with Ctrl+Shift+1 to 9, or press Ctrl+K and ask — Poly operates the dock.",
    dockTarget: undefined,
    durationMs: 9000,
  },
  {
    id: "customize",
    title: "Themes + Dock Styles, Live",
    narration: "Watch the bottom chat while Poly cycles themes and dock styles, then settles back on default.",
    dockTarget: "agent",
    durationMs: 10000,
  },
  {
    id: "research",
    title: "Deep Web Research via TinyFish",
    narration: "Poly researches the web with TinyFish — progress stays visible below.",
    dockTarget: "agent",
    durationMs: 10000,
  },
  {
    id: "read",
    title: "Reader: Watch a Video",
    narration: "Poly opens the most relevant video in the reader — watch, then it returns to the feed.",
    dockTarget: "agent",
    durationMs: 10000,
  },
  {
    id: "build",
    title: "Poly Builds: Research Dashboard",
    narration: "Poly builds a research dashboard plugin — live, in your dock.",
    dockTarget: "agent",
    durationMs: 10000,
  },
  {
    id: "remember",
    title: "Memory + Notes",
    narration: "Poly saves what matters to memory and shows it in Notes.",
    dockTarget: "agent",
    durationMs: 9000,
  },
  {
    id: "handoff",
    title: "Your Workspace, Working Together",
    narration: "This is your workspace. Tell me what you want to build next.",
    dockTarget: "agent",
    durationMs: 7000,
  },
];

/**
 * Real prompts the walkthrough runs: each stage presents its prompt in the
 * bottom chat and the actual agent processes it. The user (or the demo
 * runner) sends; the tour never fabricates results.
 */
export const ONBOARDING_STEP_PROMPTS: Partial<Record<OnboardingStep, string>> = {
  customize:
    "Open the Settings tool (dock id 'settings'). Then, in ONE batch with parallel calls: set this GIF as the workspace background (wallpaper opacity 0.25) https://raw.githubusercontent.com/rachelvansciver/SpinningASCIIDonut/master/spinningdonut.gif with a complementing theme and the glass dock at the bottom. Do not list or search the dock — use the ids given here. Use the fewest tool calls possible, narrate briefly, then return to the tour with dock.open onboarding.",
  research:
    "Research the latest developments in AI agents, autonomous workflows, and new AI-powered developer tools. Search the web for interesting articles, blog posts, YouTube videos, and relevant resources. Use TinyFish to discover and collect relevant content, then organize everything into a visual feed inside my workspace with source links and short descriptions.",
  read:
    "Using the research feed we just collected, pick the single most relevant video, open it in the reader so I can watch it, keep it open briefly, then close the reader and return to the feed. Narrate in the bottom chat while you do it.",
  build:
    "I want a dedicated AI research dashboard for this workspace. Build a plugin that lets me explore the research we just collected: a visual overview of the collected resources, categories or filters for different topics, clear source titles and short descriptions, links to open the original articles and videos, and a clean interface that fits the current workspace theme. Validate it, install it, and open it in the dock.",
  remember:
    "Remember that I am evaluating PolyDocks for the hackathon demo and I like calm dark workspaces. Save that as a memory, write a short note titled 'Demo notes' in Notes with my goal and the workspace setup, then open Notes so I can see it.",
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
