import { create } from "zustand";

export interface ProfileState {
  level: number;
  xp: number;
  xpToNextLevel: number;
  streak: number;
  lastActiveDate: string;
  completedQuests: string[];

  addXp: (amount: number) => void;
  recordActivity: () => void;
  completeQuest: (questId: string, xpReward?: number) => void;
  resetProfile: () => void;
}

function calculateXpToNextLevel(level: number): number {
  return level * 100;
}

const INITIAL_STATE = {
  level: 1,
  xp: 0,
  xpToNextLevel: 100,
  streak: 1,
  lastActiveDate: new Date().toISOString().split("T")[0],
  completedQuests: [] as string[],
};

export const useProfileStore = create<ProfileState>((set, get) => ({
  ...INITIAL_STATE,

  addXp: (amount: number) => {
    if (amount <= 0) return;

    let { level, xp, xpToNextLevel } = get();
    xp += amount;

    // Handle leveling up
    while (xp >= xpToNextLevel) {
      xp -= xpToNextLevel;
      level += 1;
      xpToNextLevel = calculateXpToNextLevel(level);
    }

    set({ level, xp, xpToNextLevel });
  },

  recordActivity: () => {
    const today = new Date().toISOString().split("T")[0];
    const { lastActiveDate, streak } = get();

    if (lastActiveDate === today) {
      return; // Already recorded today
    }

    const last = new Date(lastActiveDate);
    const curr = new Date(today);
    const diffDays = Math.round((curr.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      set({ streak: streak + 1, lastActiveDate: today });
    } else {
      set({ streak: 1, lastActiveDate: today });
    }
  },

  completeQuest: (questId: string, xpReward: number = 50) => {
    const { completedQuests, addXp } = get();
    if (!completedQuests.includes(questId)) {
      set({ completedQuests: [...completedQuests, questId] });
      addXp(xpReward);
    }
  },

  resetProfile: () => {
    set(INITIAL_STATE);
  },
}));
