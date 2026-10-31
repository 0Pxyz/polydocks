import { create } from "zustand";
import { platformStorage } from "@/lib/platform/storage";
import {
  applyDockDirective,
  DEFAULT_PINNED_IDS,
  migratePinnedIds,
  type DockDirective,
} from "@/lib/dock/dockModel";
import {
  emptyDock,
  openItem,
  closeItem,
  focusItem,
  focusByIndex,
  focusNext,
  backgroundItem,
  setActiveContext,
  registerItem,
  visibleIds,
  assignPanels,
  DOCK_ACTIONS,
  type DockItemsSnapshot,
} from "@/lib/dock/dockItems";

const DOCK_LAYOUT_KEY = "polymax-dock-layout";
const DOCK_ITEMS_KEY = "polymax-dock-items-v1";

function loadPinnedIds(): string[] {
  const stored = platformStorage.getItem<{ pinnedIds?: string[] }>(DOCK_LAYOUT_KEY);
  if (stored?.pinnedIds && Array.isArray(stored.pinnedIds) && stored.pinnedIds.length > 0) {
    return migratePinnedIds(stored.pinnedIds);
  }
  return [...DEFAULT_PINNED_IDS];
}

function persistPinnedIds(pinnedIds: string[]): void {
  // Read-cache only: the durable pin truth lives server-side (dock_pins).
  // Kept so a cleared cache still rehydrates from the server merge.
  platformStorage.setItem(DOCK_LAYOUT_KEY, { pinnedIds });
}

function loadDockSnapshot(): DockItemsSnapshot {
  const raw = platformStorage.getItem<DockItemsSnapshot>(DOCK_ITEMS_KEY);
  if (raw && typeof raw === "object" && (raw as any).items && Array.isArray((raw as any).order)) {
    return { ...emptyDock(), ...(raw as DockItemsSnapshot) };
  }
  return emptyDock();
}

function persistDockSnapshot(snapshot: DockItemsSnapshot): void {
  platformStorage.setItem(DOCK_ITEMS_KEY, snapshot);
}

/** Legacy mirrors derived from the single source (read-cache for old UI). */
function deriveLegacy(snapshot: DockItemsSnapshot): { openIds: string[]; activeToolId: string | null } {
  const openIds = snapshot.order.filter((id) => {
    const record = snapshot.items[id];
    return record && record.state !== "closed";
  });
  return { openIds, activeToolId: snapshot.focusedId };
}

export interface DockState {
  activeToolId: string | null;
  isExpanded: boolean;
  sideBySide: boolean;
  pinnedToolIds: string[];
  openIds: string[];
  /** Single source: one record per dock item (plugin). */
  dock: DockItemsSnapshot;

  setActiveTool: (toolId: string | null) => void;
  toggleExpanded: () => void;
  setExpanded: (expanded: boolean) => void;
  toggleSideBySide: () => void;
  setSideBySide: (enabled: boolean) => void;
  pinTool: (toolId: string) => void;
  unpinTool: (toolId: string) => void;
  mergeServerPins: (ids: string[]) => void;
  openTool: (toolId: string, contextId?: string | null) => void;
  closeTool: (toolId: string) => void;
  focusTool: (toolId: string) => void;
  backgroundTool: (toolId?: string) => void;
  focusByIndex: (index: number) => void;
  focusNext: (direction?: 1 | -1) => void;
  /** Opaque scope switch (workspace id or null for global). Persists every record. */
  setActiveContext: (contextId: string | null) => void;
  /** Register without opening (mount bookkeeping). */
  registerDockItem: (id: string, contextId?: string | null) => void;
  /** One registry for keyboard, REST, CLI and agent verbs. */
  runDockAction: (
    actionId: string,
    params?: { index?: number; id?: string }
  ) => { ok: boolean; message: string };
  dockActions: typeof DOCK_ACTIONS;
  visibleIds: () => string[];
  layoutPanels: (viewportWidth: number) => void;
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

export const useDockStore = create<DockState>((set, get) => {
  const initialDock = loadDockSnapshot();
  const legacy = deriveLegacy(initialDock);
  return {
    ...INITIAL_DOCK_STATE,
    pinnedToolIds: loadPinnedIds(),
    openIds: legacy.openIds.length > 0 ? legacy.openIds : INITIAL_DOCK_STATE.openIds,
    activeToolId: initialDock.focusedId ?? INITIAL_DOCK_STATE.activeToolId,
    dock: initialDock,
    dockActions: DOCK_ACTIONS,

    setActiveTool: (toolId) =>
      set((state) => {
        if (!toolId) {
          const cleared = { ...state.dock, focusedId: null };
          // Demote stale focused flag to open so nothing stays focused-but-hidden.
          const items = { ...cleared.items };
          for (const [id, record] of Object.entries(items)) {
            if (record.state === "focused") items[id] = { ...record, state: "open" as const };
          }
          const dock = { ...cleared, items };
          persistDockSnapshot(dock);
          return { dock, activeToolId: null, openIds: deriveLegacy(dock).openIds };
        }
        const dock = focusItem(state.dock, toolId);
        // focusItem is a no-op for other-context ids: never show inaccessible items.
        // Fall back to opening when the id is missing or closed in scope.
        const record = dock.items[toolId] ?? state.dock.items[toolId];
        const inScope = !record || record.contextId === null || record.contextId === dock.activeContextId;
        const needsOpen = inScope && (!record || record.state === "closed" || record.state === "background");
        const next = needsOpen ? openItem(state.dock, toolId, dock.activeContextId) : dock;
        persistDockSnapshot(next);
        const derived = deriveLegacy(next);
        return { dock: next, activeToolId: next.focusedId, openIds: derived.openIds };
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

    /**
     * Merge the server pin record (durable per-workspace truth) into the
     * local pin set. Union: local instant pins stay, server pins are added.
     */
    mergeServerPins: (ids: string[]) =>
      set((state) => {
        const known = new Set(state.pinnedToolIds);
        let changed = false;
        for (const id of ids) {
          if (typeof id === "string" && id && !known.has(id)) {
            known.add(id);
            changed = true;
          }
        }
        if (!changed) return state;
        const pinnedToolIds = [...known];
        persistPinnedIds(pinnedToolIds);
        return { pinnedToolIds };
      }),

    openTool: (toolId, contextId) =>
      set((state) => {
        const scope = contextId === undefined ? state.dock.activeContextId : contextId;
        const dock = openItem(state.dock, toolId, scope);
        persistDockSnapshot(dock);
        const derived = deriveLegacy(dock);
        return { dock, activeToolId: dock.focusedId, openIds: derived.openIds };
      }),

    closeTool: (toolId) =>
      set((state) => {
        const dock = closeItem(state.dock, toolId);
        persistDockSnapshot(dock);
        const derived = deriveLegacy(dock);
        return { dock, activeToolId: dock.focusedId, openIds: derived.openIds };
      }),

    focusTool: (toolId) =>
      set((state) => {
        const dock = focusItem(state.dock, toolId);
        persistDockSnapshot(dock);
        const derived = deriveLegacy(dock);
        return { dock, activeToolId: dock.focusedId, openIds: derived.openIds };
      }),

    backgroundTool: (toolId) =>
      set((state) => {
        const dock = backgroundItem(state.dock, toolId);
        persistDockSnapshot(dock);
        const derived = deriveLegacy(dock);
        return { dock, activeToolId: dock.focusedId, openIds: derived.openIds };
      }),

    focusByIndex: (index) =>
      set((state) => {
        const dock = focusByIndex(state.dock, index);
        persistDockSnapshot(dock);
        const derived = deriveLegacy(dock);
        return { dock, activeToolId: dock.focusedId, openIds: derived.openIds };
      }),

    focusNext: (direction = 1) =>
      set((state) => {
        const dock = focusNext(state.dock, direction);
        persistDockSnapshot(dock);
        const derived = deriveLegacy(dock);
        return { dock, activeToolId: dock.focusedId, openIds: derived.openIds };
      }),

    setActiveContext: (contextId) =>
      set((state) => {
        const dock = setActiveContext(state.dock, contextId);
        persistDockSnapshot(dock);
        const derived = deriveLegacy(dock);
        return { dock, activeToolId: dock.focusedId, openIds: derived.openIds };
      }),

    registerDockItem: (id, contextId) =>
      set((state) => {
        const scope = contextId === undefined ? state.dock.activeContextId : contextId;
        const dock = registerItem(state.dock, { id, contextId: scope });
        persistDockSnapshot(dock);
        const derived = deriveLegacy(dock);
        return { dock, openIds: derived.openIds };
      }),

    runDockAction: (actionId, params) => {
      const state = get();
      switch (actionId) {
        case "tabs.focus": {
          const index = params?.index ?? 0;
          const before = state.dock.focusedId;
          get().focusByIndex(index);
          const after = get().dock.focusedId;
          return after && after !== before
            ? { ok: true, message: `Focused "${after}".` }
            : { ok: Boolean(after), message: after ? `Focused "${after}".` : "Nothing to focus." };
        }
        case "tabs.next":
          get().focusNext(1);
          return { ok: true, message: `Focused "${get().dock.focusedId ?? ""}".` };
        case "tabs.prev":
          get().focusNext(-1);
          return { ok: true, message: `Focused "${get().dock.focusedId ?? ""}".` };
        case "tabs.close": {
          const target = params?.id ?? state.dock.focusedId;
          if (!target) return { ok: false, message: "Nothing focused to close." };
          get().closeTool(target);
          return { ok: true, message: `Closed "${target}". Nothing was deleted.` };
        }
        case "tabs.background": {
          const target = params?.id ?? state.dock.focusedId;
          if (!target) return { ok: false, message: "Nothing focused to background." };
          get().backgroundTool(target);
          return { ok: true, message: `Moved "${target}" to background.` };
        }
        case "chat.toggle": {
          // Chat is a global panel: focus it when hidden, close it when focused.
          const chatId = "agent";
          if (state.dock.focusedId === chatId) {
            get().closeTool(chatId);
            return { ok: true, message: "Chat hidden." };
          }
          get().openTool(chatId, null);
          return { ok: true, message: "Chat focused." };
        }
        default:
          return { ok: false, message: `Unknown dock action "${actionId}".` };
      }
    },

    visibleIds: () => visibleIds(get().dock),

    layoutPanels: (viewportWidth) =>
      set((state) => {
        const dock = assignPanels(state.dock, viewportWidth);
        persistDockSnapshot(dock);
        return { dock, activeToolId: dock.focusedId };
      }),

    applyDirective: (directive, knownIds) => {
      const layout = {
        pinnedIds: get().pinnedToolIds,
        openIds: get().openIds,
      };
      const result = applyDockDirective(layout, directive, knownIds);
      // Keep the single source in sync with the legacy directive path.
      const dock = { ...get().dock };
      if (directive.op === "open") {
        const next = openItem(dock, directive.id, dock.activeContextId);
        persistDockSnapshot(next);
        const derived = deriveLegacy(next);
        set({ pinnedToolIds: result.layout.pinnedIds, openIds: derived.openIds, dock: next, activeToolId: next.focusedId });
      } else if (directive.op === "close") {
        const next = closeItem(dock, directive.id);
        persistDockSnapshot(next);
        const derived = deriveLegacy(next);
        set({ pinnedToolIds: result.layout.pinnedIds, openIds: derived.openIds, dock: next, activeToolId: next.focusedId });
      } else {
        set({ pinnedToolIds: result.layout.pinnedIds, openIds: result.layout.openIds });
      }
      persistPinnedIds(result.layout.pinnedIds);
      return { ok: result.ok, message: result.message };
    },

    resetDock: () => {
      persistPinnedIds([...DEFAULT_PINNED_IDS]);
      const dock = emptyDock();
      persistDockSnapshot(dock);
      set({
        ...INITIAL_DOCK_STATE,
        pinnedToolIds: [...DEFAULT_PINNED_IDS],
        dock,
      });
    },
  };
});
