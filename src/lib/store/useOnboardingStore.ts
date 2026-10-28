import { create } from "zustand";
import { platformStorage } from "@/lib/platform/storage";

const ONBOARDING_STORAGE_KEY = "polymax_onboarding_completed_v1";

interface OnboardingStoreState {
  isOpen: boolean;
  hasCompleted: boolean;
  openOnboarding: () => void;
  closeOnboarding: () => void;
  completeOnboarding: () => void;
  resetOnboarding: () => void;
}

function loadInitialStatus(): boolean {
  return platformStorage.getItem<boolean>(ONBOARDING_STORAGE_KEY, false) === true;
}

export const useOnboardingStore = create<OnboardingStoreState>((set) => ({
  isOpen: !loadInitialStatus(),
  hasCompleted: loadInitialStatus(),

  openOnboarding: () => set({ isOpen: true }),

  closeOnboarding: () => {
    platformStorage.setItem(ONBOARDING_STORAGE_KEY, true);
    set({ isOpen: false, hasCompleted: true });
  },

  completeOnboarding: () => {
    platformStorage.setItem(ONBOARDING_STORAGE_KEY, true);
    set({ isOpen: false, hasCompleted: true });
  },

  resetOnboarding: () => {
    platformStorage.removeItem(ONBOARDING_STORAGE_KEY);
    set({ isOpen: true, hasCompleted: false });
  },
}));
