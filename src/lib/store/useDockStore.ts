import { create } from "zustand";
import { platformStorage } from "@/lib/platform/storage";
import {
  applyDockDirective,
  DEFAULT_PINNED_IDS,
  migratePinnedIds,
  type DockDirective,
} from "@/lib/dock/dockModel";
import {
  BESIDE_WIDTH_DEFAULT,
  BESIDE_WIDTH_MAX,
  BESIDE_WIDTH_MIN,
  adoptServerDock,
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

const DOCK_LAYOUT_KEY = "polydocks-dock-layout";
const DOCK_ITEMS_KEY = "polydocks-dock-items-v1";

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

const BESIDE_KEY = "polydocks-tool-sidebar";

interface BesidePersisted {
  ids?: string[];
  width?: number;
  /** Panel collapsed (hidden, tools kept mounted). Defaults to false. */
  collapsed?: boolean;
  /** Last selected beside tab. Validated against ids on load. */
  selected?: string | null;
}

/** Reads persisted beside state (used at store creation; exported for tests). */
export function loadBeside(): { ids: string[]; width: number; collapsed: boolean; selected: string | null } {
  const stored = platformStorage.getItem<BesidePersisted>(BESIDE_KEY);
  const ids = Array.isArray(stored?.ids) ? stored.ids.filter((id) => typeof id === "string" && id) : [];
  const width =
    typeof stored?.width === "number" && stored.width >= BESIDE_WIDTH_MIN && stored.width <= BESIDE_WIDTH_MAX
      ? stored.width
      : BESIDE_WIDTH_DEFAULT;
  const collapsed = stored?.collapsed === true;
  const selected = typeof stored?.selected === "string" && ids.includes(stored.selected) ? stored.selected : null;
  return { ids, width, collapsed, selected };
}

function persistBeside(ids: string[], width: number, ui?: { collapsed: boolean; selected: string | null }): void {
  if (ui) {
    platformStorage.setItem<BesidePersisted>(BESIDE_KEY, { ids, width, ...ui });
    return;
  }
  // Id/width writes preserve the UI fields (selection, collapsed).
  const prev = platformStorage.getItem<BesidePersisted>(BESIDE_KEY);
  platformStorage.setItem<BesidePersisted>(BESIDE_KEY, {
    ids,
    width,
    collapsed: prev?.collapsed === true,
    selected: typeof prev?.selected === "string" ? prev.selected : null,
  });
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

  /** Tools open beside the main view (on-demand second panel). */
  besideIds: string[];
  /** Beside panel width (persisted, resizable). */
  besideWidth: number;
  /** Open a tool beside: mounts it, selects it in the panel, keeps main focus. */
  openBeside: (toolId: string) => void;
  /** Remove a tool from beside (record stays open, unfocused). */
  closeBeside: (toolId: string) => void;
  /** Empty the beside panel. */
  clearBeside: () => void;
  setBesideWidth: (width: number) => void;
  /** Persist beside UI (collapsed/selected) without touching ids/width. */
  persistBesideUi: (ui: { collapsed?: boolean; selected?: string | null }) => void;
  setActiveTool: (toolId: string | null) => void;
  toggleExpanded: () => void;
  setExpanded: (expanded: boolean) => void;
  toggleSideBySide: () => void;
  setSideBySide: (enabled: boolean) => void;
  pinTool: (toolId: string) => void;
  unpinTool: (toolId: string) => void;
  mergeServerPins: (ids: string[]) => void;
  /**
   * Adopt the server open set when the local read-cache is empty (#174).
   * Fresh profiles and cleared storage boot from dock_items instead of an
   * empty dock; existing local state is never overwritten. No-op offline.
   */
  hydrateDockFromServer: () => Promise<void>;
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

/** Tools that must stay main-only: agent has its own panel, maps its own
 *  surface, and the onboarding stage breaks when squeezed into the beside
 *  panel (tour loses main focus, choreography fights over besideSelected).
 *  Browser/notes stay allowed here: the scripted tour mounts them beside
 *  the stage on purpose. Single source for the store-level guard. */
const BESIDE_BLOCKED_IDS = new Set(["agent", "maps", "onboarding"]);

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
    besideIds: loadBeside().ids,
    besideWidth: loadBeside().width,

    openBeside: (toolId) =>
      set((state) => {
        if (!toolId || toolId === "agent") return state;
        // Main-only surfaces never belong in the beside panel.
        if (BESIDE_BLOCKED_IDS.has(toolId)) return state;
        // Ensure the record exists and is not closed; never steal main focus.
        let dock = state.dock;
        const record = dock.items[toolId];
        if (!record || record.state === "closed") {
          dock = openItem(dock, toolId, dock.activeContextId);
        }
        // Moving the focused tool beside frees the main view (focus goes to
        // the visual neighbor); otherwise main focus is untouched.
        if (dock.focusedId === toolId) {
          dock = backgroundItem(dock, toolId);
        }
        persistDockSnapshot(dock);
        const besideIds = state.besideIds.includes(toolId)
          ? state.besideIds
          : [...state.besideIds, toolId];
        persistBeside(besideIds, state.besideWidth);
        const derived = deriveLegacy(dock);
        return { dock, besideIds, activeToolId: dock.focusedId, openIds: derived.openIds };
      }),

    closeBeside: (toolId) =>
      set((state) => {
        if (!state.besideIds.includes(toolId)) return state;
        const besideIds = state.besideIds.filter((id) => id !== toolId);
        persistBeside(besideIds, state.besideWidth);
        return { besideIds };
      }),

    clearBeside: () =>
      set((state) => {
        if (state.besideIds.length === 0) return state;
        persistBeside([], state.besideWidth);
        return { besideIds: [] as string[] };
      }),

    setBesideWidth: (width) =>
      set((state) => {
        const clamped = Math.min(Math.max(width, BESIDE_WIDTH_MIN), BESIDE_WIDTH_MAX);
        if (clamped === state.besideWidth) return state;
        persistBeside(state.besideIds, clamped);
        return { besideWidth: clamped };
      }),

    persistBesideUi: (ui) =>
      set((state) => {
        const prev = platformStorage.getItem<BesidePersisted>(BESIDE_KEY);
        platformStorage.setItem<BesidePersisted>(BESIDE_KEY, {
          ids: state.besideIds,
          width: state.besideWidth,
          collapsed: ui.collapsed ?? prev?.collapsed === true,
          selected: ui.selected !== undefined ? ui.selected : typeof prev?.selected === "string" ? prev.selected : null,
        });
        return state;
      }),

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

    hydrateDockFromServer: async () => {
      if (get().dock.order.length > 0) return;
      try {
        const res = await fetch("/api/dock/action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ op: "tabs.list" }),
        });
        if (!res.ok) return;
        const data = await res.json().catch(() => ({}));
        const rows = Array.isArray(data?.data?.dockItems) ? data.data.dockItems : [];
        if (rows.length === 0) return;
        set((state) => {
          const dock = adoptServerDock(state.dock, rows);
          if (dock === state.dock) return state;
          persistDockSnapshot(dock);
          const derived = deriveLegacy(dock);
          return { dock, activeToolId: dock.focusedId, openIds: derived.openIds };
        });
      } catch {
        // Offline-first: boot with an empty dock, verbs re-register rows.
      }
    },

    closeTool: (toolId) =>
      set((state) => {
        const dock = closeItem(state.dock, toolId);
        persistDockSnapshot(dock);
        const derived = deriveLegacy(dock);
        // Single home per tool: a closed tool leaves the beside set too.
        if (!state.besideIds.includes(toolId)) {
          return { dock, activeToolId: dock.focusedId, openIds: derived.openIds };
        }
        const besideIds = state.besideIds.filter((id) => id !== toolId);
        persistBeside(besideIds, state.besideWidth);
        return { dock, besideIds, activeToolId: dock.focusedId, openIds: derived.openIds };
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
        const dock = focusByIndex(state.dock, index, state.pinnedToolIds);
        persistDockSnapshot(dock);
        const derived = deriveLegacy(dock);
        return { dock, activeToolId: dock.focusedId, openIds: derived.openIds };
      }),

    focusNext: (direction = 1) =>
      set((state) => {
        const dock = focusNext(state.dock, direction, state.pinnedToolIds);
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
        case "sidebar.beside": {
          const target = params?.id ?? state.dock.focusedId;
          if (!target || target === "agent") {
            return { ok: false, message: "Nothing suitable to open beside." };
          }
          // Main-only surfaces (onboarding stage) are rejected here so
          // verb/CLI paths can't bypass the UI eligibility check either.
          // Browser/notes stay allowed: the scripted tour mounts them
          // beside the stage on purpose.
          if (BESIDE_BLOCKED_IDS.has(target)) {
            return { ok: false, message: `"${target}" stays in the main view.` };
          }
          if (state.besideIds.includes(target)) {
            get().closeBeside(target);
            return { ok: true, message: `Removed "${target}" from beside.` };
          }
          get().openBeside(target);
          return { ok: true, message: `Opened "${target}" beside.` };
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
      persistBeside([], BESIDE_WIDTH_DEFAULT, { collapsed: false, selected: null });
      const dock = emptyDock();
      persistDockSnapshot(dock);
      set({
        ...INITIAL_DOCK_STATE,
        pinnedToolIds: [...DEFAULT_PINNED_IDS],
        besideIds: [],
        besideWidth: BESIDE_WIDTH_DEFAULT,
        dock,
      });
    },
  };
});

if (typeof window !== "undefined") {
  (window as any).__dockStore = useDockStore;
}
