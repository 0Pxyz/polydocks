import { create } from "zustand";

export interface DockState {
  activeToolId: string | null;
  isExpanded: boolean;
  sideBySide: boolean;
  pinnedToolIds: string[];

  setActiveTool: (toolId: string | null) => void;
  toggleExpanded: () => void;
  setExpanded: (expanded: boolean) => void;
  toggleSideBySide: () => void;
  setSideBySide: (enabled: boolean) => void;
  pinTool: (toolId: string) => void;
  unpinTool: (toolId: string) => void;
  resetDock: () => void;
}

const INITIAL_DOCK_STATE = {
  activeToolId: "agent",
  isExpanded: false,
  sideBySide: false,
  pinnedToolIds: ["agent", "terminal", "browser", "notes", "world"],
};

export const useDockStore = create<DockState>((set) => ({
  ...INITIAL_DOCK_STATE,

  setActiveTool: (toolId) =>
    set({
      activeToolId: toolId,
    }),

  toggleExpanded: () =>
    set((state) => ({
      isExpanded: !state.isExpanded,
    })),

  setExpanded: (expanded) =>
    set({
      isExpanded: expanded,
    }),

  toggleSideBySide: () =>
    set((state) => ({
      sideBySide: !state.sideBySide,
    })),

  setSideBySide: (enabled) =>
    set({
      sideBySide: enabled,
    }),

  pinTool: (toolId) =>
    set((state) => {
      if (state.pinnedToolIds.includes(toolId)) return state;
      return { pinnedToolIds: [...state.pinnedToolIds, toolId] };
    }),

  unpinTool: (toolId) =>
    set((state) => ({
      pinnedToolIds: state.pinnedToolIds.filter((id) => id !== toolId),
    })),

  resetDock: () =>
    set(INITIAL_DOCK_STATE),
}));
