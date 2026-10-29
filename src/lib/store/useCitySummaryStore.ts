import { create } from "zustand";

export interface CityToolCounts {
  sources: number;
  notes: number;
  quests: number;
  doneQuests: number;
}

interface CitySummaryState {
  summaries: Record<string, CityToolCounts>;
  setSummary: (cityId: string, counts: CityToolCounts) => void;
  clearSummary: (cityId: string) => void;
}

export const useCitySummaryStore = create<CitySummaryState>((set) => ({
  summaries: {},

  setSummary: (cityId, counts) =>
    set((state) => ({
      summaries: { ...state.summaries, [cityId]: counts },
    })),

  clearSummary: (cityId) =>
    set((state) => {
      const summaries = { ...state.summaries };
      delete summaries[cityId];
      return { summaries };
    }),
}));
