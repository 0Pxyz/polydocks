import { create } from "zustand";
import { platformStorage } from "@/lib/platform/storage";
import {
  applyDockDirective,
  DEFAULT_PINNED_IDS,
  migratePinnedIds,
  type DockDirective,
} from "@/lib/dock/dockModel";

const DOCK_LAYOUT_KEY = "polymax-dock-layout";

function loadPinnedIds(): string[] {
  const stored = platformStorage.getItem<{ pinnedIds?: string[] }>(DOCK_LAYOUT_KEY);
  if (stored?.pinnedIds && Array.isArray(stored.pinnedIds) && stored.pinnedIds.length > 0) {
    return migratePinnedIds(stored.pinnedIds);
  }
  return [...DEFAULT_PINNED_IDS];
}

function persistPinnedIds(pinnedIds: string[]): void {
  platformStorage.setItem(DOCK_LAYOUT_KEY, { pinnedIds });
}

export interface DockState {
  activeToolId: string | null;
  isExpanded: boolean;
  sideBySide: boolean;
  pinnedToolIds: string[];
  openIds: string[];

  setActiveTool: (toolId: string | null) => void;
  toggleExpanded: () => void;
  setExpanded: (expanded: boolean) => void;
  toggleSideBySide: () => void;
  setSideBySide: (enabled: boolean) => void;
  pinTool: (toolId: string) => void;
  unpinTool: (toolId: string) => void;
  openTool: (toolId: string) => void;
  closeTool: (toolId: string) => void;
  /**
   * Shared action layer for agent-driven dock changes. Applies one directive
   * and reads the resulting state back; `ok: false` means the caller must
   * surface `message` visibly instead of pretending it worked.
   */
  applyDirective: (
    directive: DockDirective,
    knownIds: Set<string>
  ) => { ok: boolean; message: string };
  resetDock: () => void;
}

const INITIAL_DOCK_STATE = {
  activeToolId: "agent",
  isExpanded: false,
  sideBySide: false,
  pinnedToolIds: [...DEFAULT_PINNED_IDS],
  openIds: [] as string[],
};

export const useDockStore = create<DockState>((set, get) => ({
  ...INITIAL_DOCK_STATE,
  pinnedToolIds: loadPinnedIds(),

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
      const pinnedToolIds = [...state.pinnedToolIds, toolId];
      persistPinnedIds(pinnedToolIds);
      return { pinnedToolIds };
    }),

  unpinTool: (toolId) =>
    set((state) => {
      const pinnedToolIds = state.pinnedToolIds.filter((id) => id !== toolId);
      persistPinnedIds(pinnedToolIds);
      return { pinnedToolIds };
    }),

  openTool: (toolId) =>
    set((state) => ({
      openIds: [toolId, ...state.openIds.filter((id) => id !== toolId)],
    })),

  closeTool: (toolId) =>
    set((state) => ({
      openIds: state.openIds.filter((id) => id !== toolId),
    })),

  applyDirective: (directive, knownIds) => {
    const layout = {
      pinnedIds: get().pinnedToolIds,
      openIds: get().openIds,
    };
    const result = applyDockDirective(layout, directive, knownIds);
    set({ pinnedToolIds: result.layout.pinnedIds, openIds: result.layout.openIds });
    persistPinnedIds(result.layout.pinnedIds);
    return { ok: result.ok, message: result.message };
  },

  resetDock: () => {
    persistPinnedIds([...DEFAULT_PINNED_IDS]);
    set({
      ...INITIAL_DOCK_STATE,
      pinnedToolIds: [...DEFAULT_PINNED_IDS],
    });
  },
}));
