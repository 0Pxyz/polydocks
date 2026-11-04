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

const STORAGE_KEY = "polydocks-profile-state";

function loadStoredProfile(): typeof INITIAL_STATE {
  if (typeof window === "undefined") return INITIAL_STATE;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        level: typeof parsed.level === "number" ? parsed.level : INITIAL_STATE.level,
        xp: typeof parsed.xp === "number" ? parsed.xp : INITIAL_STATE.xp,
        xpToNextLevel:
          typeof parsed.xpToNextLevel === "number"
            ? parsed.xpToNextLevel
            : calculateXpToNextLevel(parsed.level || 1),
        streak: typeof parsed.streak === "number" ? parsed.streak : INITIAL_STATE.streak,
        lastActiveDate:
          typeof parsed.lastActiveDate === "string" ? parsed.lastActiveDate : INITIAL_STATE.lastActiveDate,
        completedQuests: Array.isArray(parsed.completedQuests)
          ? parsed.completedQuests
          : INITIAL_STATE.completedQuests,
      };
    }
  } catch {
    // Ignore storage parse errors
  }
  return INITIAL_STATE;
}

function persistProfile(state: {
  level: number;
  xp: number;
  xpToNextLevel: number;
  streak: number;
  lastActiveDate: string;
  completedQuests: string[];
}) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage write errors
  }
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  ...loadStoredProfile(),

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

    const nextState = { ...get(), level, xp, xpToNextLevel };
    persistProfile(nextState);
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

    const nextStreak = diffDays === 1 ? streak + 1 : 1;
    const nextState = { ...get(), streak: nextStreak, lastActiveDate: today };
    persistProfile(nextState);
    set({ streak: nextStreak, lastActiveDate: today });
  },

  completeQuest: (questId: string, xpReward: number = 50) => {
    const { completedQuests, addXp } = get();
    if (!completedQuests.includes(questId)) {
      const nextCompleted = [...completedQuests, questId];
      set({ completedQuests: nextCompleted });
      persistProfile({ ...get(), completedQuests: nextCompleted });
      addXp(xpReward);
    }
  },

  resetProfile: () => {
    persistProfile(INITIAL_STATE);
    set(INITIAL_STATE);
  },
}));
